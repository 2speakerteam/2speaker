const { pathMatchesRequest } = require('./field-access');

function fieldAction(evidence, { question = '', history = [] } = {}) {
  const access = evidence.accessResearch;
  if (!access) return null;
  const fastest = /(?:제일|가장|더)\s*빠른|빠른\s*길|최단|fastest|shortest|最短|最快|最速/i.test(question);
  const overview = /전체\s*(?:경로|코스)|(?:경로|코스|지점)\s*순서|route overview|all (?:steps|landmarks)|全体の経路|完整路线/i.test(question);
  const constraints = { via: access.via || '', origin: evidence.requestedStart || access.requestedOrigin || '' };
  const conflicted = new Set((access.comparison?.conflicts || []).flatMap(conflict => conflict.paths || []));
  const candidates = (access.paths || []).filter(path => !conflicted.has(path.id) && pathMatchesRequest(path, constraints));
  const nodes = access.alignment?.remainingNodes || [];
  const connector = access.alignment?.connector;
  const connected = access.selectedPathId && nodes.length > 0 && access.alignment?.approach === 'provider_approach_to_entry_found'
    && connector?.endpointMatch === true && connector.scope === 'origin_to_entry_only_not_entire_trail'
    && Number.isFinite(connector.distanceMeters) && connector.distanceMeters >= 0
    && Number.isFinite(connector.totalSeconds) && connector.totalSeconds >= 0;
  const kind = !access.selectedPathId ? 'confirm_requested_entrance'
    : connected ? 'approach_verified_entrance'
      : access.alignment?.namedStartOnPublishedSequence ? 'confirm_next_signpost' : 'confirm_entry_signpost';
  return { kind, fastestRequested: fastest, fastestVerified: false, overviewRequested: overview,
    followup: history.some(turn => turn?.role === 'assistant'),
    requestedVia: constraints.via, requestedOrigin: constraints.origin,
    entryName: nodes[0] || '', nextLandmark: nodes[1] || '',
    candidateCount: candidates.length,
    candidates: candidates.map(path => ({ id: path.id, sourceId: path.sourceId, nodes: path.nodes,
      fullDistanceVerified: false, fullTimeVerified: false })),
    ...(connected ? { roadApproach: { distanceMeters: connector.distanceMeters, totalSeconds: connector.totalSeconds,
      scope: connector.scope, endpointMatch: true } } : {}) };
}

function renderFieldAction(text, evidence, language, request = {}) {
  const state = fieldAction(evidence, request);
  if (!state) return text;
  const access = evidence.accessResearch;
  // A station procedure without an extracted access path keeps the existing
  // operator-instruction answer; this renderer only handles route access.
  if (!access.selectedPathId && !state.requestedVia && !state.requestedOrigin
    && evidence.environment !== 'mountain' && !access.comparison?.conflicts?.length) return text;
  const lang = (language || 'ko').split('-')[0];
  const entry = state.entryName, next = state.nextLandmark;
  const focus = state.requestedVia || state.requestedOrigin;
  const labels = {
    ko: {
      fastest: state.candidateCount > 1 ? `요청 조건에 맞는 자료 후보 ${state.candidateCount}개를 대조했지만 전체 경로의 거리·시간이 검증되지 않아 가장 빠른 경로는 확정할 수 없습니다. `
        : '전체 경로의 거리·시간이 검증되지 않아 가장 빠른 경로는 확정할 수 없습니다. ',
      unresolved: focus ? `‘${focus}’ 기준으로 목적지까지 이어지는 구간을 아직 검증하지 못했습니다. 그 입구 이정표에 적힌 지명을 알려 주세요.`
        : '현재 위치와 목적지 사이의 연결을 확인하려면 지금 보이는 이정표에 적힌 지명이 필요합니다. 어떤 지명이 적혀 있나요?',
      conflict: '자료마다 연결 순서가 달라 다음 방향을 확정할 수 없습니다. 지금 보이는 이정표에 적힌 지명을 알려 주세요.',
      approach: distance => `먼저 ‘${entry}’ 입구까지 도보 약 ${distance.minutes}분, ${distance.meters}m의 도로 접근 경로가 확인됐습니다. 이 입구까지 이동한 뒤 표지판의 지명을 확인해 주세요. 이 수치는 입구까지만 해당합니다.`,
      next: `말씀하신 지점 다음으로 자료에서 확인된 지점은 ‘${next || entry}’입니다. 지금 이정표에 ‘${next || entry}’가 표시돼 있나요?`,
      sign: `현재 위치에서 ‘${focus || entry}’ 입구로 연결되는 구간은 아직 확인되지 않았습니다. 지금 보이는 입구 이정표에 적힌 지명을 알려 주세요.`,
      overview: chain => `자료에 소개된 순서는 ${chain}입니다. `
    },
    en: {
      fastest: `The ${state.candidateCount || 'available'} published candidate route${state.candidateCount === 1 ? '' : 's'} lack verified whole-route distances and times, so the fastest route is not established. `,
      unresolved: focus ? `A continuous connection through or from ${focus} is not verified. What place names are on that entrance's signpost?`
        : 'What place names are on the signpost at your current position?',
      conflict: 'The accounts disagree on the connection order. What place names are on the nearest signpost?',
      approach: distance => `First approach the ${entry} entrance using the checked road route: about ${distance.minutes} minutes and ${distance.meters} m. Check the entrance sign when you arrive. These figures cover only the road approach.`,
      next: `The next source-described landmark after your named position is ${next || entry}. Does the signpost show ${next || entry}?`,
      sign: `The connection from your position to ${focus || entry} is not verified. What place names are on the entrance sign you can see?`,
      overview: chain => `The published sequence is ${chain}. `
    },
    ja: {
      fastest: '全区間の距離と時間が未確認のため、最短経路は確定できません。 ',
      unresolved: `${focus ? `${focus}を通る接続は未確認です。` : ''}現在見える入口の案内標識には何と書かれていますか。`,
      conflict: '資料間で接続順序が一致していません。現在見える案内標識の地名を教えてください。',
      approach: distance => `まず${entry}の入口まで、確認済みの一般道経路は徒歩約${distance.minutes}分、${distance.meters}mです。入口で標識の地名を確認してください。この数値は入口までの区間のみです。`,
      next: `資料で次に確認できる地点は${next || entry}です。現在の標識にその地名がありますか。`,
      sign: `${focus || entry}の入口までの接続は未確認です。現在見える入口の標識には何と書かれていますか。`,
      overview: chain => `公開資料の順序は${chain}です。 `
    },
    zh: {
      fastest: '全程距离和时间尚未核实，不能确定最快路线。 ',
      unresolved: `${focus ? `途经或从${focus}出发的连接尚未核实。` : ''}您现在看到的入口路标上写着什么地名？`,
      conflict: '资料中的连接顺序存在冲突。您现在看到的路标上写着什么地名？',
      approach: distance => `请先前往${entry}入口，已查询到的道路接近路线步行约${distance.minutes}分钟、${distance.meters}米。到入口后请核对路标地名。该数值仅适用于到入口的道路段。`,
      next: `资料中下一个确认的地点是${next || entry}。当前路标上是否写着该地名？`,
      sign: `当前位置到${focus || entry}入口的连接尚未核实。您现在看到的入口路标上写着什么地名？`,
      overview: chain => `公开资料中的顺序为${chain}。 `
    }
  };
  const words = labels[lang];
  if (!words) return text;
  const prefix = state.fastestRequested ? words.fastest : '';
  if (!access.selectedPathId) return prefix + (access.comparison?.conflicts?.length ? words.conflict : words.unresolved);
  const overview = state.overviewRequested ? words.overview((access.alignment?.remainingNodes || []).join(' → ')) : '';
  if (state.roadApproach) return prefix + words.approach({ minutes: Math.max(1, Math.ceil(state.roadApproach.totalSeconds / 60)),
    meters: Math.round(state.roadApproach.distanceMeters) }) + (overview ? ` ${overview.trim()}` : '');
  return prefix + overview + (state.kind === 'confirm_next_signpost' ? words.next : words.sign);
}

module.exports = { fieldAction, renderFieldAction };
