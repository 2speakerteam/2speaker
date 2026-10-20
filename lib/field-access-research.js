const { renderFieldAction } = require('./field-access-action');
const { validatePaths, comparePaths, selectPath, distanceMeters, extractionInstruction, contains, sourceBlocks,
  landmarkName, matchesLandmark, pathMatchesRequest } = require('./field-access');
const { sourceImageParts } = require('./field-source-media');

async function researchAccess({ req, message, history, plan, via, location, evidence, stats,
  model, moreSources, resolvePlace, walkRoute }) {
  const assignSources = () => {
    evidence.sources = evidence.sources.filter((source, i, list) => list.findIndex(row => row.url === source.url) === i).slice(0, 11);
    evidence.sources.forEach((source, i) => { source.id = `S${i + 1}`; });
  };
  assignSources();
  const request = { via, origin: evidence.requestedStart };
  const focus = landmarkName(via || evidence.requestedStart);
  const extract = async (includeImages = true) => {
    const read = evidence.sources.filter(source => source.content).sort((a, b) =>
      Number(Boolean(focus && contains(b.content, focus))) * 40 + Number(b.kind === 'official') * 10
      - Number(Boolean(focus && contains(a.content, focus))) * 40 - Number(a.kind === 'official') * 10).slice(0, 4);
    if (!read.length) return [];
    const media = includeImages ? await sourceImageParts(read, stats) : [];
    stats.accessExtractions = (stats.accessExtractions || 0) + 1;
    const input = { destination: evidence.requestedDestination || plan.searchSubject, namedStart: evidence.requestedStart,
      requestedVia: via, userQuestion: message,
      sources: read.map(({ id, kind, url, content, bodyTruncated, readStatus }) => ({ id, kind, url,
        blocks: sourceBlocks(content).map(({ id, text }) => ({ id, text })), bodyTruncated, readStatus }))
    };
    let data;
    try { data = await model(req, extractionInstruction, input, true, stats, media); }
    catch (error) {
      if (!media.length) throw error;
      stats.sourceImageModelFailures = (stats.sourceImageModelFailures || 0) + 1;
      data = await model(req, extractionInstruction, input, true, stats);
    }
    const diagnostics = {};
    const paths = validatePaths(data, read, evidence.requestedDestination || plan.searchSubject, diagnostics);
    for (const [key, value] of Object.entries(diagnostics)) stats[`accessValidation_${key}`] = value;
    return paths;
  };
  let paths;
  try { paths = await extract(); }
  catch { stats.accessExtractionFailures = (stats.accessExtractionFailures || 0) + 1; paths = []; }
  // One bounded follow-up addresses a missing user-named connection, rather than
  // repeatedly returning the same generic destination search.
  if ((via || evidence.requestedStart) && !paths.some(path => pathMatchesRequest(path, request))) {
    stats.accessFocusedSearches = (stats.accessFocusedSearches || 0) + 1;
    try {
      const extra = await moreSources(via || evidence.requestedStart);
      // Newly targeted pages must not be discarded behind the old broad
      // destination search when the bounded source list is already full.
      evidence.sources = [...extra.sources, ...evidence.sources]; evidence.lookupErrors.push(...extra.errors);
      assignSources();
      // Re-extract from the enlarged set with stable source IDs; no cross-source stitching.
      paths = [];
      paths = await extract(false);
    } catch { stats.accessFocusedSearchFailures = (stats.accessFocusedSearchFailures || 0) + 1; }
  }
  const comparison = comparePaths(paths);
  const selected = selectPath(paths, { via, origin: evidence.requestedStart, comparison });
  stats.accessPaths = paths.length;
  stats.accessConflicts = comparison.conflicts.length;
  stats.accessSelected = Number(Boolean(selected));
  stats.accessConstraintUnmatched = Number(Boolean((via || evidence.requestedStart) && !selected));
  evidence.accessResearch = { paths, comparison, via, requestedOrigin: evidence.requestedStart,
    selectedPathId: selected?.id || '', constraintsMatched: Boolean(selected),
    imageUse: 'historical_visual_context_only; text-grounded_edges_required',
    guidance: 'No new geometry, current closure claim or unverified local turn.' };
  if (!selected) return;
  const namedIndex = evidence.requestedStart ? selected.nodes.findIndex(node => matchesLandmark(node, evidence.requestedStart)) : -1;
  const viaIndex = via ? selected.nodes.findIndex(node => matchesLandmark(node, via)) : -1;
  // From GPS, approach the requested waypoint itself. An earlier park in a
  // published account is not automatically the user's required entrance.
  const entryIndex = namedIndex >= 0 ? namedIndex : viaIndex >= 0 ? viaIndex : selected.entryIndex;
  const entryName = selected.nodes[entryIndex];
  const alignment = { entryName, startIndex: entryIndex, remainingNodes: selected.nodes.slice(entryIndex),
    namedStartOnPublishedSequence: namedIndex >= 0, physicalPositionOnTrailVerified: false,
    approach: namedIndex >= 0 ? 'user_named_start_on_published_sequence' : 'not_verified',
    landmarks: [], connector: null };
  evidence.accessResearch.alignment = alignment;
  // An indoor GPS fix cannot establish floor, side of a gate, platform or corridor.
  if (evidence.environment === 'subway_inside') {
    alignment.approach = 'indoor_sign_or_floor_confirmation_needed'; return;
  }
  const origin = evidence.requestedStart ? evidence.origin || null : location.point || null;
  const indexes = [...new Set([entryIndex, ...(via ? selected.nodes.map((node, i) =>
    contains(node, via) || contains(via, node) ? i : -1).filter(i => i >= 0) : [])])].slice(0, 2);
  for (const index of indexes) {
    const name = selected.nodes[index];
    try {
      const result = await resolvePlace(name, stats);
      const place = result.place;
      if (!place) { alignment.landmarks.push({ name, status: 'unresolved' }); continue; }
      const proximity = { name, status: 'place_coordinates_found', place,
        distanceFromPreciseOriginMeters: origin ? Math.round(distanceMeters(origin, place)) : null,
        use: 'straight_line_proximity_does_not_establish_path_or_same_floor' };
      const samples = evidence.routeAssessment?.sourceGeometry || [];
      proximity.distanceToProviderSamplesMeters = samples.length ? Math.round(Math.min(...samples.map(pair =>
        distanceMeters(place, { lat: pair[1], lng: pair[0] })))) : null;
      proximity.providerComparisonUse = 'sample_proximity_only_not_connected_trail_or_same_level';
      alignment.landmarks.push(proximity);
      if (index !== entryIndex || !origin || namedIndex >= 0) continue;
      if (distanceMeters(origin, place) < 25) {
        alignment.approach = 'near_entry_coordinate_requires_visual_confirmation'; continue;
      }
      const resultRoute = await walkRoute(origin, place, stats);
      if (resultRoute?.coordinateMatch === true && resultRoute?.route && Number.isFinite(resultRoute.route.distanceMeters)
        && Number.isFinite(resultRoute.route.totalSeconds)) {
        alignment.approach = 'provider_approach_to_entry_found';
        alignment.connector = { from: evidence.requestedStart || 'fresh physical GPS', to: place.title,
          scope: 'origin_to_entry_only_not_entire_trail', distanceMeters: resultRoute.route.distanceMeters,
          totalSeconds: resultRoute.route.totalSeconds, endpointMatch: resultRoute.coordinateMatch === true,
          route: resultRoute.route };
      }
    } catch { stats.accessApproachFailures = (stats.accessApproachFailures || 0) + 1; }
  }
}

function answerEvidence(evidence) {
  const access = evidence.accessResearch;
  if (!access?.selectedPathId && !access?.via && !access?.comparison?.conflicts?.length
    && !(access && evidence.environment === 'mountain' && evidence.route)) return evidence;
  // Keep the provider response in the audit layer, but remove its unrelated
  // through-route metrics/turns from the answer input when published access wins.
  const { route, selectedRoute, routeAssessment, ...rest } = evidence;
  return { ...rest, route: null, routeStatus: access.selectedPathId ? 'published_access_overview' : 'published_connection_unresolved',
    sources: (evidence.sources || []).map(source => ({ ...source, images: undefined, content: source.content?.slice(0, 1200) })),
    selectedRoute: { ...selectedRoute, routeText: '', basis: selectedRoute?.basis },
    providerReference: { available: Boolean(route), mode: route?.mode || '',
      status: evidence.routeStatus, shortestRouteVerified: false,
      investigateAlternatives: routeAssessment?.investigateAlternatives || false,
      basis: 'separate_provider_route_not_the_published_access_path' },
    accessResearch: { ...evidence.accessResearch, paths: (evidence.accessResearch.paths || []).map(path => ({ ...path,
      edges: path.id === access.selectedPathId ? path.edges.map(edge => ({ from: edge.from, to: edge.to,
        evidenceExcerpt: edge.quote.slice(0, 400), status: 'validated_in_one_contiguous_read_source' })) : [] })),
      alignment: { ...evidence.accessResearch.alignment,
      connector: evidence.accessResearch.alignment?.connector ? {
        from: evidence.accessResearch.alignment.connector.from, to: evidence.accessResearch.alignment.connector.to,
        scope: 'origin_to_entry_only_not_entire_trail', providerResponse: 'available'
      } : null } } };
}

function retainPublishedSequence(text, evidence, language, request = {}) {
  return renderFieldAction(text, evidence, language, request);
}

module.exports = { researchAccess, answerEvidence, retainPublishedSequence };
