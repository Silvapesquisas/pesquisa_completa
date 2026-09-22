// ============================================================================
// Amostragem: dimensionamento, cotas por estrato e precisão realizada.
//
// Duas famílias de cálculo, que se espelham:
//
//  1. QUANTITATIVA — "quantas entrevistas?"
//     requiredSampleSize(): a partir do universo, da margem desejada, do nível
//     de confiança e do efeito de desenho, devolve o n necessário.
//     marginOfError(): o caminho inverso, dado um n.
//
//  2. QUALITATIVA — "quais pessoas?"
//     buildSamplePlan(): distribui o n entre os estratos (sexo, zona, idade,
//     escolaridade...) na proporção do universo, gerando a cota e a margem de
//     cada grupo.
//     evaluateSample(): depois do campo, compara o que foi realizado com o
//     universo, calcula os pesos de pós-estratificação e a margem REAL, que é
//     sempre maior que a nominal quando a amostra sai desbalanceada.
//
// Convenções: proporções em % (0–100); p = 0,5 (pior caso) salvo indicação.
// ============================================================================

// Valores críticos da normal padrão (bicaudal).
const Z = { 80: 1.2816, 85: 1.4395, 90: 1.6449, 95: 1.96, 97: 2.1701, 99: 2.5758 };
export const CONFIDENCE_LEVELS = [90, 95, 99];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const zFor = (confidence) => Z[Number(confidence)] ?? Z[95];

/** Nível de confiança efetivo de uma pesquisa (nulo = 95%). */
export const confidenceOf = (survey) => num(survey?.confidence_level) || 95;

/** Efeito de desenho declarado (nulo ou inválido = 1, amostra aleatória simples). */
export const designEffectOf = (survey) => {
  const d = num(survey?.design_effect);
  return d && d >= 1 ? d : 1;
};

/** Universo/público-alvo. Zero ou nulo = população tratada como infinita. */
export const populationOf = (survey) => {
  const N = num(survey?.population_size);
  return N && N > 0 ? Math.round(N) : null;
};

/**
 * Correção de população finita: √((N − n) / (N − 1)).
 * Só reduz a margem de forma relevante quando a amostra é uma fração grande
 * do universo (acima de ~10%).
 */
export function finitePopulationCorrection(n, N) {
  if (!N || !n || N <= 1 || n >= N) return n && N && n >= N ? 0 : 1;
  return Math.sqrt((N - n) / (N - 1));
}

/**
 * Margem de erro (em pontos percentuais) de uma proporção.
 *   e = z · √(p(1−p)/n) · √(deff) · FPC
 * @returns {number|null} margem em p.p., ou null se n inválido.
 */
export function marginOfError({ n, N = null, p = 0.5, confidence = 95, deff = 1 }) {
  const size = num(n);
  if (!size || size <= 0) return null;
  const z = zFor(confidence);
  const d = deff && deff >= 1 ? deff : 1;
  return z * Math.sqrt((p * (1 - p)) / size) * Math.sqrt(d) * finitePopulationCorrection(size, N) * 100;
}

/**
 * Tamanho de amostra necessário para uma margem de erro desejada.
 *   n₀ = z²·p(1−p)/e²   →   n = n₀ / (1 + (n₀−1)/N)   →   n × deff
 * @returns {number|null} n arredondado para cima.
 */
export function requiredSampleSize({ N = null, margin, p = 0.5, confidence = 95, deff = 1 }) {
  const e = num(margin);
  if (!e || e <= 0 || e >= 100) return null;
  const z = zFor(confidence);
  const d = deff && deff >= 1 ? deff : 1;
  const n0 = (z * z * p * (1 - p)) / Math.pow(e / 100, 2);
  const nFinite = N && N > 0 ? n0 / (1 + (n0 - 1) / N) : n0;
  const n = Math.ceil(nFinite * d);
  return N && N > 0 ? Math.min(n, N) : n;
}

/**
 * Reparte `total` entre participações percentuais preservando a soma exata
 * (método dos maiores restos — evita que a soma das cotas fique 1 acima ou
 * abaixo do total por causa do arredondamento).
 */
export function allocateProportional(total, shares) {
  const t = Math.max(0, Math.round(num(total) || 0));
  const list = shares.map(s => Math.max(0, num(s) || 0));
  const sum = list.reduce((a, b) => a + b, 0);
  if (!t || sum <= 0) return list.map(() => 0);

  const exact = list.map(s => (s / sum) * t);
  const floors = exact.map(Math.floor);
  let rest = t - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && rest > 0; k++, rest--) floors[order[k].i] += 1;
  return floors;
}

/** Normaliza a estratificação vinda do banco, descartando entradas inválidas. */
export function normalizeStrata(strata) {
  return (Array.isArray(strata) ? strata : [])
    .map(s => ({
      id: s?.id || null,
      label: String(s?.label || "").trim(),
      question_id: s?.question_id || null,
      groups: (Array.isArray(s?.groups) ? s.groups : [])
        .map(g => ({ label: String(g?.label || "").trim(), share: Math.max(0, num(g?.share) || 0) }))
        .filter(g => g.label !== ""),
    }))
    .filter(s => s.label !== "" && s.groups.length > 0);
}

/**
 * QUANTITATIVA + QUALITATIVA: plano amostral completo da pesquisa.
 * Usa a meta de entrevistas cadastrada; se não houver, dimensiona a partir da
 * margem desejada.
 */
export function buildSamplePlan(survey) {
  const N = populationOf(survey);
  const confidence = confidenceOf(survey);
  const deff = designEffectOf(survey);
  const targetMargin = num(survey?.target_margin);
  const goal = num(survey?.target_interviews);

  const suggested = targetMargin ? requiredSampleSize({ N, margin: targetMargin, confidence, deff }) : null;
  const n = goal && goal > 0 ? Math.round(goal) : suggested;

  const strata = normalizeStrata(survey?.strata).map(s => {
    const shareSum = s.groups.reduce((a, g) => a + g.share, 0);
    const quotas = allocateProportional(n || 0, s.groups.map(g => g.share));
    return {
      ...s,
      shareSum,
      // Alerta de cadastro: as participações deveriam somar 100%.
      shareOk: Math.abs(shareSum - 100) < 0.5,
      groups: s.groups.map((g, i) => ({
        ...g,
        // Participação renormalizada, para a cota fazer sentido mesmo com
        // percentuais que não somam exatamente 100.
        normalizedShare: shareSum > 0 ? (g.share / shareSum) * 100 : 0,
        quota: quotas[i],
        margin: marginOfError({ n: quotas[i], N: N ? Math.round((g.share / (shareSum || 100)) * N) : null, confidence, deff }),
      })),
    };
  });

  return {
    N, n, confidence, deff, targetMargin, suggested,
    margin: marginOfError({ n, N, confidence, deff }),
    marginSRS: marginOfError({ n, confidence }),          // sem FPC nem deff, para comparação
    fpc: finitePopulationCorrection(n, N),
    strata,
    hasStrata: strata.length > 0,
  };
}

/* ───────────────────── Precisão realizada (pós-campo) ───────────────────── */

// Resposta de uma entrevista para uma questão (mesma leitura do reportData).
function answerOf(interview, questionId) {
  const a = (interview?.answers || []).find(x => x.question_id === questionId);
  if (!a) return null;
  if (a.answer_array && a.answer_array.length) return a.answer_array.find(Boolean) || null;
  return a.answer || null;
}

const normalizeLabel = (v) => String(v ?? "").trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Pesos de pós-estratificação por iteração proporcional (raking / IPF).
 * Ajusta os pesos até que a composição ponderada da amostra reproduza a
 * participação de cada grupo no universo, em todas as dimensões ao mesmo tempo.
 *
 * @param {number[][]} cells  para cada unidade, o índice do grupo em cada dimensão
 * @param {number[][]} targets participação alvo (0–1) de cada grupo, por dimensão
 */
export function rakeWeights(cells, targets, { iterations = 50, tolerance = 1e-6 } = {}) {
  const n = cells.length;
  const w = new Array(n).fill(1);
  if (!n || !targets.length) return w;

  for (let it = 0; it < iterations; it++) {
    let maxDelta = 0;
    for (let d = 0; d < targets.length; d++) {
      const groups = targets[d];
      const sums = new Array(groups.length).fill(0);
      let totalW = 0;
      for (let i = 0; i < n; i++) { sums[cells[i][d]] += w[i]; totalW += w[i]; }
      if (totalW <= 0) continue;

      const factors = groups.map((share, g) => {
        if (sums[g] <= 0) return 1;                 // grupo sem nenhuma entrevista: não dá para ajustar
        return share / (sums[g] / totalW);
      });
      for (let i = 0; i < n; i++) w[i] *= factors[cells[i][d]];
      maxDelta = Math.max(maxDelta, ...factors.map(f => Math.abs(f - 1)));
    }
    if (maxDelta < tolerance) break;
  }
  // Normaliza para média 1 (não muda a precisão, mas deixa o peso legível).
  const mean = w.reduce((a, b) => a + b, 0) / n;
  return mean > 0 ? w.map(x => x / mean) : w;
}

/**
 * Efeito de desenho devido à ponderação (Kish): deff = 1 + CV²(w).
 * Quanto mais desigual a distribuição dos pesos — isto é, quanto mais a amostra
 * desviou do universo — maior o deff e menor a amostra efetiva.
 */
export function kishDeff(weights) {
  const n = weights.length;
  if (!n) return 1;
  const sum = weights.reduce((a, b) => a + b, 0);
  const sumSq = weights.reduce((a, b) => a + b * b, 0);
  if (sum <= 0) return 1;
  return (n * sumSq) / (sum * sum);
}

/**
 * Compara a amostra realizada com o universo e devolve a precisão REAL.
 *
 * @returns null quando não há plano de estratificação utilizável; caso
 *   contrário, um objeto com a composição por estrato, os pesos, o efeito de
 *   desenho medido, a amostra efetiva e a margem real.
 */
export function evaluateSample({ survey, interviews }) {
  const list = Array.isArray(interviews) ? interviews : [];
  const n = list.length;
  const N = populationOf(survey);
  const confidence = confidenceOf(survey);
  const declaredDeff = designEffectOf(survey);
  const plan = buildSamplePlan(survey);

  const nominalMargin = marginOfError({ n, N, confidence });

  // Dimensões utilizáveis: estrato vinculado a uma questão do questionário.
  const dims = plan.strata.filter(s => s.question_id);
  if (!n || dims.length === 0) {
    return {
      n, N, confidence, declaredDeff,
      nominalMargin,
      strata: plan.strata.map(s => ({ ...s, groups: s.groups.map(g => ({ ...g, count: null })) })),
      weighted: null,
      // Sem estratos vinculados só dá para informar a margem nominal.
      realMargin: marginOfError({ n, N, confidence, deff: declaredDeff }),
      effectiveN: declaredDeff > 1 ? Math.round(n / declaredDeff) : n,
      weightingDeff: 1,
      matched: n, unmatched: 0,
    };
  }

  // Índice do grupo de cada entrevista, em cada dimensão. Entrevistas sem
  // resposta reconhecível em alguma dimensão ficam fora da ponderação.
  const indexOfGroup = dims.map(s => {
    const map = new Map();
    s.groups.forEach((g, i) => map.set(normalizeLabel(g.label), i));
    return map;
  });

  const cells = [];
  const counts = dims.map(s => new Array(s.groups.length).fill(0));
  let unmatched = 0;
  for (const iv of list) {
    const row = [];
    let ok = true;
    for (let d = 0; d < dims.length; d++) {
      const idx = indexOfGroup[d].get(normalizeLabel(answerOf(iv, dims[d].question_id)));
      if (idx == null) { ok = false; break; }
      row.push(idx);
    }
    if (!ok) { unmatched++; continue; }
    cells.push(row);
    row.forEach((g, d) => { counts[d][g] += 1; });
  }

  const matched = cells.length;
  if (!matched) {
    return {
      n, N, confidence, declaredDeff, nominalMargin,
      strata: plan.strata.map(s => ({ ...s, groups: s.groups.map(g => ({ ...g, count: 0 })) })),
      weighted: null,
      realMargin: marginOfError({ n, N, confidence, deff: declaredDeff }),
      effectiveN: declaredDeff > 1 ? Math.round(n / declaredDeff) : n,
      weightingDeff: 1,
      matched: 0, unmatched,
    };
  }

  const targets = dims.map(s => {
    const sum = s.groups.reduce((a, g) => a + g.share, 0) || 1;
    return s.groups.map(g => g.share / sum);
  });
  const weights = rakeWeights(cells, targets);
  const weightingDeff = kishDeff(weights);
  const totalDeff = weightingDeff * declaredDeff;
  const effectiveN = Math.max(1, Math.round(matched / totalDeff));

  // Peso médio de cada grupo (o que o relatório mostra por linha).
  const groupWeight = dims.map(s => new Array(s.groups.length).fill(0));
  cells.forEach((row, i) => row.forEach((g, d) => { groupWeight[d][g] += weights[i]; }));

  const byDim = new Map(dims.map((s, d) => [s, d]));
  const strata = plan.strata.map(s => {
    const d = byDim.get(s);
    if (d == null) return { ...s, linked: false, groups: s.groups.map(g => ({ ...g, count: null })) };
    const dimTotal = counts[d].reduce((a, b) => a + b, 0) || 1;
    return {
      ...s,
      linked: true,
      groups: s.groups.map((g, i) => {
        const count = counts[d][i];
        const sampleShare = (count / dimTotal) * 100;
        return {
          ...g,
          count,
          sampleShare,
          deviation: sampleShare - g.normalizedShare,     // em pontos percentuais
          weight: count > 0 ? groupWeight[d][i] / count : null,
          margin: marginOfError({ n: count, confidence }),
        };
      }),
    };
  });

  return {
    n, N, confidence, declaredDeff,
    matched, unmatched,
    nominalMargin,
    weightingDeff,
    totalDeff,
    effectiveN,
    realMargin: marginOfError({ n: effectiveN, N, confidence }),
    // Maior desvio absoluto observado: resume a representatividade em um número.
    maxDeviation: Math.max(...strata.filter(s => s.linked)
      .flatMap(s => s.groups.map(g => Math.abs(g.deviation ?? 0)))),
    strata,
    weighted: true,
  };
}

/** Formata uma margem/percentual no padrão brasileiro (uma casa decimal). */
export const fmtPct = (v, digits = 1) =>
  (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(digits).replace(".", ",")}%`);

/**
 * Formata um desvio em pontos percentuais, sempre com sinal.
 * Usa hífen simples: o sinal de menos tipográfico (−) não existe na
 * codificação padrão das fontes do jsPDF e sairia como lixo no PDF.
 */
export const fmtDeviation = (v, digits = 1) =>
  (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(digits).replace(".", ",")} p.p.`);
