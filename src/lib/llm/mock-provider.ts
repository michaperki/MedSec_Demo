import type { ConceptId, LabName } from "../concepts";
import type { Concern, Extraction } from "./schema";
import type {
  ConcernStreamChunk,
  ExtractionResult,
  LLMProvider,
  SafetyCheckLLMRequest,
} from "./provider";

function requestText(request: SafetyCheckLLMRequest): string {
  return [request.presentation, ...Object.values(request.structuredFields ?? {})]
    .filter(Boolean)
    .join("\n");
}

/**
 * Deterministic, keyword-based stand-in for the LLM calls. Lets the
 * prototype run end-to-end (including all demo cases) with no API key
 * configured. Not a substitute for the real model on free-form input — it
 * recognizes the phrasing used in this app's demo cases and common
 * synonyms, nothing more.
 */
export class MockLLMProvider implements LLMProvider {
  async runExtraction(request: SafetyCheckLLMRequest): Promise<ExtractionResult> {
    const start = performance.now();
    const extraction = extractFacts(requestText(request), request);
    return {
      extraction,
      timing: { stage: "extraction", model: "mock", durationMs: performance.now() - start },
    };
  }

  async *streamConcerns(request: SafetyCheckLLMRequest): AsyncGenerator<ConcernStreamChunk> {
    const start = performance.now();
    // The mock provider has no real extraction/concerns split — it derives
    // both from the same regex pass over the text, independent of whatever
    // the (also-running) runExtraction call produces. That keeps the mock
    // provider's two methods as independently callable as the real one's.
    const facts = extractFacts(requestText(request), request);
    for (const concern of deriveConcerns(facts, requestText(request))) {
      yield { type: "concern", concern };
    }
    yield {
      type: "timing",
      timing: { stage: "concerns", model: "mock", durationMs: performance.now() - start },
    };
  }
}

function num(re: RegExp, text: string): number | undefined {
  const m = text.match(re);
  if (!m) return undefined;
  const v = parseFloat(m[1]);
  return Number.isNaN(v) ? undefined : v;
}

const NEGATION_CUE = /\b(no|not|without|denies|denied|negative for|no evidence of|no known|no signs of|no reports? of|absence of|ruled out)\b[^.]{0,25}$/i;

/**
 * Matches a concept keyword and checks a short preceding window for a
 * negation cue ("no fever", "denies hemoptysis") — without this, naive
 * substring matching would flag "no fever" as evidence FOR fever, which is
 * exactly the kind of silent fact-inversion this tool must never produce.
 * A negated match still yields an explicit fact (value: false) rather than
 * omitting it — "no leg swelling reported" is stronger information than
 * "not mentioned".
 */
function conceptFact(text: string, re: RegExp) {
  const m = re.exec(text);
  if (!m) return undefined;
  const preceding = text.slice(Math.max(0, m.index - 30), m.index);
  const negated = NEGATION_CUE.test(preceding);
  return { value: !negated, source: "inferred" as const, evidence: m[0] };
}

function extractFacts(text: string, request: SafetyCheckLLMRequest): Extraction {
  const sf = request.structuredFields;

  const age =
    sf?.age ??
    num(/\b(\d{1,3})[\s-]*(?:year|yo\b|y\.?o\.?|yr)/i, text);
  const sexMatch = sf?.sex ?? (/\bfemale\b/i.test(text) ? "female" : /\bmale\b/i.test(text) ? "male" : undefined);

  const heartRate = num(/\bHR\s*(\d{2,3})\b/i, text) ?? num(/heart rate[^\d]{0,10}(\d{2,3})/i, text);
  const bpMatch = text.match(/\bBP\s*(\d{2,3})\/(\d{2,3})/i) ?? text.match(/blood pressure[^\d]{0,10}(\d{2,3})\/(\d{2,3})/i);
  const respRate = num(/\bRR\s*(\d{1,2})\b/i, text) ?? num(/respiratory rate[^\d]{0,10}(\d{1,2})/i, text);
  const tempF = num(/temp(?:erature)?[^\d]{0,10}(\d{2,3}(?:\.\d)?)\s*°?\s*F/i, text);
  const tempC = num(/temp(?:erature)?[^\d]{0,10}(\d{2}(?:\.\d)?)\s*°?\s*C/i, text);
  const spo2 = num(/(?:spo2|oxygen saturation|o2 sat(?:uration)?)[^\d]{0,10}(\d{2,3})\s*%/i, text);

  const concepts: Extraction["concepts"] = [];
  const addConcept = (id: ConceptId, re: RegExp) => {
    const f = conceptFact(text, re);
    if (f) concepts.push({ id, ...f });
  };

  addConcept("active_malignancy", /cancer|malignan|metasta|tumor|carcinoma/i);
  addConcept("recent_cytotoxic_chemotherapy", /chemotherapy|chemo\b|folfox|folfiri|cisplatin|carboplatin|cytotoxic/i);
  addConcept("checkpoint_inhibitor_therapy", /pembrolizumab|nivolumab|checkpoint inhibitor|immunotherapy|ipilimumab|atezolizumab|durvalumab/i);
  addConcept("known_neutropenia", /neutropeni/i);
  addConcept("fever", /\bfever\b|febrile/i);
  addConcept("rigors", /\brigors\b|\bchills\b/i);
  addConcept("hemoptysis", /hemoptysis|coughing (up )?blood/i);
  addConcept("pleuritic_chest_pain", /pleuritic/i);
  addConcept("dyspnea", /dyspnea|shortness of breath|short of breath|\bSOB\b/i);
  addConcept("chest_pain", /chest pain|chest pressure|chest tightness|chest discomfort/i);
  addConcept("back_pain", /back pain/i);
  addConcept("lower_extremity_weakness", /leg weakness|lower extremity weakness|weakness in (his|her|their) legs|difficulty walking|leg(s)? feel(ing)? weak/i);
  addConcept("bladder_or_bowel_dysfunction", /bladder (dysfunction|incontinence|retention)|bowel (dysfunction|incontinence)|urinary retention/i);
  addConcept("saddle_anesthesia", /saddle anesthesia|saddle numbness/i);
  addConcept("diarrhea", /diarrhea/i);
  addConcept("abdominal_pain", /abdominal pain|abdomen pain|belly pain/i);
  addConcept("altered_mental_status", /confusion|confused|altered mental status|somnolent|lethargic|disoriented/i);
  addConcept("unilateral_leg_swelling", /leg swelling|swollen leg|calf swelling|swelling in (his|her|their) leg/i);
  addConcept("headache", /headache/i);
  addConcept("smoking", /smok(ing|er)|pack[- ]year/i);
  addConcept("diabetes", /diabet/i);
  addConcept("hypertension", /hypertension|\bHTN\b/i);
  addConcept("hyperlipidemia", /hyperlipidemia|high cholesterol/i);
  addConcept("outpatient_at_fever_onset", /outpatient|at home|clinic visit/i);

  const heartRateFact = heartRate !== undefined ? { value: heartRate, source: "explicit" as const } : undefined;
  const sbpFact = bpMatch ? { value: parseFloat(bpMatch[1]), source: "explicit" as const } : undefined;
  const dbpFact = bpMatch ? { value: parseFloat(bpMatch[2]), source: "explicit" as const } : undefined;
  const rrFact = respRate !== undefined ? { value: respRate, source: "explicit" as const } : undefined;
  const tempCValue = tempC ?? (tempF !== undefined ? ((tempF - 32) * 5) / 9 : undefined);
  const tempFact = tempCValue !== undefined ? { value: Math.round(tempCValue * 10) / 10, source: "explicit" as const } : undefined;
  const spo2Fact = spo2 !== undefined ? { value: spo2, source: "explicit" as const } : undefined;

  const cancerMatch = text.match(/(metastatic|stage [iv]+)?\s*([a-z]+(?:\s[a-z]+)?\s(?:cancer|carcinoma|lymphoma|leukemia))/i);
  const treatmentMatch = text.match(/\b(FOLFOX|FOLFIRI|pembrolizumab|nivolumab|cisplatin|carboplatin|chemotherapy)\b/i);

  const labs: Extraction["labs"] = [];
  const addLab = (name: LabName, re: RegExp) => {
    const v = num(re, text);
    if (v !== undefined) labs.push({ name, value: v, source: "explicit" });
  };
  addLab("anc", /\bANC\s*(?:of)?\s*(\d+(?:\.\d+)?)/i);
  addLab("wbc", /\bWBC\s*(?:of)?\s*(\d+(?:\.\d+)?)/i);
  addLab("troponin", /troponin\s*(?:of)?\s*(\d+(?:\.\d+)?)/i);
  addLab("calcium", /\bcalcium\s*(?:of)?\s*(\d+(?:\.\d+)?)/i);
  addLab("albumin", /\balbumin\s*(?:of)?\s*(\d+(?:\.\d+)?)/i);

  return {
    demographics: { age, sex: sexMatch },
    cancerDiagnosis: cancerMatch
      ? { value: cancerMatch[0].trim(), source: "explicit" }
      : undefined,
    activeTreatment: treatmentMatch
      ? { value: treatmentMatch[0].trim(), source: "explicit" }
      : undefined,
    vitals: {
      heartRate: heartRateFact,
      systolicBP: sbpFact,
      diastolicBP: dbpFact,
      respiratoryRate: rrFact,
      temperature: tempFact,
      oxygenSaturation: spo2Fact,
    },
    labs,
    concepts,
  };
}

function conceptPresent(facts: Extraction, id: ConceptId): boolean {
  return facts.concepts.some((c) => c.id === id && c.value === true);
}

function deriveConcerns(facts: Extraction, text: string): Concern[] {
  const concerns: Concern[] = [];
  const malignancy = conceptPresent(facts, "active_malignancy");

  const dyspnea = conceptPresent(facts, "dyspnea");
  const pleuriticPain = conceptPresent(facts, "pleuritic_chest_pain");
  const hemoptysis = conceptPresent(facts, "hemoptysis");
  const legSwelling = conceptPresent(facts, "unilateral_leg_swelling");
  if (malignancy && (dyspnea || pleuriticPain || hemoptysis)) {
    concerns.push({
      condition: "Pulmonary embolism",
      reason:
        "Active malignancy plus acute respiratory symptoms — malignancy is a major VTE risk factor and PE can present with isolated dyspnea.",
      evidence: [
        "active malignancy",
        dyspnea ? "dyspnea" : undefined,
        pleuriticPain ? "pleuritic chest pain" : undefined,
        hemoptysis ? "hemoptysis" : undefined,
        facts.vitals.heartRate ? `heart rate ${facts.vitals.heartRate.value}` : undefined,
      ].filter(Boolean) as string[],
      suggestedRuleIds: ["wells_pe", "perc"],
      additionalMissingInformation: legSwelling
        ? []
        : ["Signs of DVT?", "Prior PE/DVT?", "Is PE judged more likely than an alternative diagnosis?"],
    });
  }
  if (legSwelling) {
    concerns.push({
      condition: "Deep vein thrombosis",
      reason: "Unilateral leg swelling in a patient with active malignancy — malignancy and immobility are major VTE risk factors.",
      evidence: ["unilateral leg swelling", malignancy ? "active malignancy" : undefined].filter(Boolean) as string[],
      suggestedRuleIds: ["wells_dvt"],
      additionalMissingInformation: [],
    });
  }

  const fever = conceptPresent(facts, "fever");
  const recentChemo = conceptPresent(facts, "recent_cytotoxic_chemotherapy");
  if (fever && (recentChemo || malignancy)) {
    const ancFact = facts.labs.find((l) => l.name === "anc");
    concerns.push({
      condition: "Neutropenic fever / serious infection",
      reason:
        "Fever after recent cytotoxic chemotherapy raises concern for neutropenic sepsis, a time-critical diagnosis regardless of how well the patient otherwise looks.",
      evidence: ["fever", recentChemo ? "recent cytotoxic chemotherapy" : "active malignancy"].filter(Boolean) as string[],
      suggestedRuleIds: ["qsofa", "sirs", "mascc", "cisne"],
      additionalMissingInformation: ancFact ? [] : ["ANC (absolute neutrophil count) — required to confirm neutropenia"],
    });
  }

  const chestPain = conceptPresent(facts, "chest_pain");
  if (chestPain) {
    concerns.push({
      condition: "Acute coronary syndrome",
      reason: "Chest pain/pressure warrants ACS risk stratification, particularly with cardiovascular risk factors present.",
      evidence: ["chest pain or pressure"],
      suggestedRuleIds: ["heart_score"],
      additionalMissingInformation: ["ECG findings", "Troponin result", "History detail (character, radiation, duration)"],
    });
  }

  const backPain = conceptPresent(facts, "back_pain");
  const leWeakness = conceptPresent(facts, "lower_extremity_weakness");
  if (malignancy && (backPain || leWeakness)) {
    concerns.push({
      condition: "Spinal cord compression",
      reason:
        "New back pain with lower-extremity weakness in a patient with known malignancy is a neuro-oncologic emergency until excluded — delayed diagnosis risks permanent paralysis.",
      evidence: [backPain ? "new back pain" : undefined, leWeakness ? "lower-extremity weakness" : undefined].filter(Boolean) as string[],
      suggestedRuleIds: [],
      additionalMissingInformation: [
        "Bladder or bowel dysfunction?",
        "Saddle anesthesia?",
        "Focal neurologic deficits on exam?",
        "Is urgent MRI spine available?",
      ],
    });
  }

  const diarrhea = conceptPresent(facts, "diarrhea");
  const checkpointInhibitor = conceptPresent(facts, "checkpoint_inhibitor_therapy");
  if (checkpointInhibitor && diarrhea) {
    concerns.push({
      condition: "Immune-related adverse event (colitis)",
      reason: "New diarrhea in a patient on checkpoint inhibitor therapy raises concern for immune-mediated colitis, which can progress rapidly if untreated.",
      evidence: ["checkpoint inhibitor therapy", "diarrhea"],
      suggestedRuleIds: [],
      additionalMissingInformation: [
        "Number of stools above baseline per day (CTCAE grading)?",
        "Blood in stool?",
        "Abdominal pain or distension?",
        "Fever?",
      ],
    });
  }

  const calciumFact = facts.labs.find((l) => l.name === "calcium");
  const albuminFact = facts.labs.find((l) => l.name === "albumin");
  if (malignancy && calciumFact) {
    concerns.push({
      condition: "Hypercalcemia of malignancy",
      reason: "Elevated calcium in a patient with active malignancy — a common and under-recognized oncologic emergency.",
      evidence: [`calcium ${calciumFact.value}`],
      suggestedRuleIds: ["corrected_calcium"],
      additionalMissingInformation: albuminFact ? [] : ["Albumin level — required to correct the calcium value"],
    });
  }

  const headache = conceptPresent(facts, "headache");
  const altered = conceptPresent(facts, "altered_mental_status");
  if (malignancy && headache && altered) {
    concerns.push({
      condition: "Intracranial process (e.g. brain metastasis, elevated ICP)",
      reason: "New headache with altered mental status in a patient with malignancy warrants urgent evaluation for intracranial pathology.",
      evidence: ["headache", "altered mental status"],
      suggestedRuleIds: [],
      additionalMissingInformation: ["Focal neurologic deficits?", "Papilledema on exam?", "Prior brain imaging?"],
    });
  }

  if (concerns.length === 0 && text.trim().length > 0) {
    concerns.push({
      condition: "Insufficient signal for automatic concern detection",
      reason:
        "The demo extractor did not match a recognized high-risk pattern in this text. This is a limitation of the offline demo extractor, not a clinical assessment — configure an API key for full-coverage extraction.",
      evidence: [],
      suggestedRuleIds: [],
      additionalMissingInformation: [],
    });
  }

  return concerns;
}
