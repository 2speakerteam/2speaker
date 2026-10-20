const { validatePaths, comparePaths, selectPath, distanceMeters, extractionInstruction, contains, sourceBlocks } = require('./field-access');
const { sourceImageParts } = require('./field-source-media');

async function researchAccess({ req, message, history, plan, via, location, evidence, stats,
  model, moreSources, resolvePlace, walkRoute }) {
  const assignSources = () => {
    evidence.sources = evidence.sources.filter((source, i, list) => list.findIndex(row => row.url === source.url) === i).slice(0, 11);
    evidence.sources.forEach((source, i) => { source.id = `S${i + 1}`; });
  };
  assignSources();
  const extract = async (includeImages = true) => {
    const read = evidence.sources.filter(source => source.content).sort((a, b) =>
      Number(Boolean(via && contains(b.content, via))) * 40 + Number(b.kind === 'official') * 10
      - Number(Boolean(via && contains(a.content, via))) * 40 - Number(a.kind === 'official') * 10).slice(0, 4);
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
  const matchesVia = path => path.nodes.some(node => contains(node, via) || contains(via, node));
  // One bounded follow-up addresses a missing user-named connection, rather than
  // repeatedly returning the same generic destination search.
  if (via && !paths.some(matchesVia)) {
    stats.accessFocusedSearches = (stats.accessFocusedSearches || 0) + 1;
    try {
      const extra = await moreSources(via);
      evidence.sources.push(...extra.sources); evidence.lookupErrors.push(...extra.errors);
      assignSources();
      // Re-extract from the enlarged set with stable source IDs; no cross-source stitching.
      paths = await extract(false);
    } catch { stats.accessFocusedSearchFailures = (stats.accessFocusedSearchFailures || 0) + 1; }
  }
  const comparison = comparePaths(paths);
  const selected = selectPath(paths, { via, origin: evidence.requestedStart, comparison });
  stats.accessPaths = paths.length;
  stats.accessConflicts = comparison.conflicts.length;
  stats.accessSelected = Number(Boolean(selected));
  evidence.accessResearch = { paths, comparison, via, selectedPathId: selected?.id || '',
    imageUse: 'historical_visual_context_only; text-grounded_edges_required',
    guidance: 'No new geometry, current closure claim or unverified local turn.' };
  if (!selected) return;
  const namedIndex = evidence.requestedStart ? selected.nodes.findIndex(node =>
    contains(node, evidence.requestedStart) || contains(evidence.requestedStart, node)) : -1;
  const entryIndex = namedIndex >= 0 ? namedIndex : selected.entryIndex;
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

function retainPublishedSequence(text, evidence, language) {
  const access = evidence.accessResearch;
  const languageKey = language?.split('-')[0];
  if (!access?.selectedPathId) {
    if (access?.comparison?.conflicts?.length && languageKey === 'ja') return '資料間で経路の順序が一致していません。現在地の案内標識に書かれた地名を教えてください。';
    if (access?.comparison?.conflicts?.length && languageKey === 'zh') return '资料中的路线顺序存在冲突。请告诉我当前位置路标上的地名。';
    if (access?.comparison?.conflicts?.length) return languageKey === 'en'
      ? 'The published route sequences disagree. I cannot choose a local turn from those accounts. What names are on the nearest signpost?'
      : '자료마다 이동 지점의 연결 순서가 달라 갈림길 방향을 확정할 수 없습니다. 현재 이정표에 적힌 지명과 가려는 방향을 알려 주세요.';
    if (access?.via && languageKey === 'ja') return `${access.via}を通る連続した経路は、取得した本文では確認できませんでした。入口の案内標識には何と書かれていますか。`;
    if (access?.via && languageKey === 'zh') return `已读取的正文尚不能确认途经${access.via}的连续路线。入口路标上写着什么？`;
    if (access?.via) return languageKey === 'en'
      ? `The retrieved articles do not establish a continuous connection through ${access.via}. What does the entrance or signpost for that path say?`
      : `조회한 본문에서 ${access.via}를 통하는 연속된 접근 구간을 확인하지 못했습니다. 그 길의 입구나 이정표에 적힌 이름을 알려 주세요.`;
    return text;
  }
  const nodes = access.alignment?.remainingNodes || [];
  const normalized = value => String(value || '').replace(/\s+/g, '').toLowerCase();
  const answer = normalized(text);
  let after = 0;
  const ordered = nodes.length > 1 && nodes.every(node => {
    const at = answer.indexOf(normalized(node), after);
    if (at < 0) return false;
    after = at + normalized(node).length; return true;
  });
  // Format the checked sequence itself. Free prose can silently insert another
  // article's landmark in the wrong order even while mentioning all chosen nodes.
  if (ordered && languageKey && !['ko', 'en', 'ja', 'zh'].includes(languageKey)) return text;
  const chain = nodes.join(' → ');
  const missingVia = access.via && !nodes.some(node => contains(node, access.via) || contains(access.via, node));
  const aligned = access.alignment?.approach === 'provider_approach_to_entry_found';
  const named = access.alignment?.namedStartOnPublishedSequence;
  if (languageKey === 'en') return `Published access information describes: ${chain}. `
    + (missingVia ? `The connection through ${access.via} is not confirmed. ` : '')
    + (aligned ? 'A separate road approach to this entrance was returned by the routing provider. Trail continuity and current access remain unverified.'
      : named ? 'This describes the journey from your named starting landmark; match the next named signpost on site.'
        : `The connection from your position to ${nodes[0]} is not confirmed. What does the nearest entrance sign say?`);
  if (languageKey === 'ja') return `公開された案内の経路は ${chain} です。現在地から入口への接続と、現地の標識を確認してください。`;
  if (languageKey === 'zh') return `公开资料介绍的路线为：${chain}。请确认当前位置与入口的连接及现场路标。`;
  return `게시 자료에는 ${chain} 순서의 접근로가 소개돼 있습니다. `
    + (missingVia ? `${access.via}를 통하는 연결은 아직 확인되지 않았습니다. ` : '')
    + (aligned ? `${nodes[0]}까지의 일반 도로 접근 경로는 별도로 조회됐으며, 숲길의 현재 통행 상태와 현장 연결은 확인이 필요합니다.`
      : named ? '말씀하신 출발 지점 기준의 접근 순서입니다. 현장에서 다음 지점 이름이 적힌 표지판을 확인해 주세요.'
        : `현재 위치에서 ${nodes[0]}까지의 연결은 확인되지 않았습니다. 가까운 입구나 이정표에 적힌 이름을 알려 주세요.`);
}

module.exports = { researchAccess, answerEvidence, retainPublishedSequence };
