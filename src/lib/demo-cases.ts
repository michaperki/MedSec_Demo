import type { MockChartRecord } from "./data-provider";
import { MockPatientDataProvider } from "./data-provider";

export const DEMO_CASES: MockChartRecord[] = [
  {
    id: "case-1-dyspnea",
    name: "Robert Miller",
    age: 62,
    sex: "M",
    diagnosis: "Metastatic colorectal cancer",
    currentTherapy: "FOLFOX (cycle 4 of ongoing)",
    overview: [
      "Diagnosed 14 months ago with liver-metastatic colon adenocarcinoma.",
      "Tolerating FOLFOX with mild baseline fatigue and peripheral neuropathy.",
      "No prior VTE. ECOG performance status 1.",
    ],
    recentLabs: [
      { name: "WBC", value: "6.1 ×10⁹/L", date: "2 days ago" },
      { name: "Hemoglobin", value: "10.8 g/dL", date: "2 days ago", flag: "low" },
      { name: "Platelets", value: "210 ×10⁹/L", date: "2 days ago" },
      { name: "Creatinine", value: "0.9 mg/dL", date: "2 days ago" },
    ],
    medications: ["Oxaliplatin/5-FU (FOLFOX)", "Ondansetron PRN", "Gabapentin 300mg TID"],
    treatmentHistory: ["FOLFOX started 3.5 months ago, cycle 4 today", "No prior surgery for primary tumor"],
    todaysEncounter:
      "62-year-old male with metastatic colon cancer currently receiving chemotherapy. Presents with new shortness of breath beginning yesterday and mild pleuritic chest pain. HR 112, BP 128/76, RR 20, oxygen saturation 93%. No known fever. No hemoptysis. No leg swelling reported.",
    structuredFields: {
      age: 62,
      sex: "male",
      cancerDiagnosis: "Metastatic colorectal cancer",
      activeTreatment: "FOLFOX, cycle 4",
    },
  },
  {
    id: "case-2-fever",
    name: "Diane Ortiz",
    age: 57,
    sex: "F",
    diagnosis: "Acute myeloid leukemia, post-induction",
    currentTherapy: "Cytarabine + daunorubicin (induction, day 12)",
    overview: [
      "Diagnosed 3 weeks ago; completed 7+3 induction 12 days ago.",
      "Expected nadir period — no ANC checked today prior to visit.",
      "No known site of infection on prior visit.",
    ],
    recentLabs: [
      { name: "WBC", value: "0.8 ×10⁹/L", date: "yesterday", flag: "critical" },
      { name: "Hemoglobin", value: "8.9 g/dL", date: "yesterday", flag: "low" },
      { name: "Platelets", value: "34 ×10⁹/L", date: "yesterday", flag: "critical" },
    ],
    medications: ["Acyclovir prophylaxis", "Fluconazole prophylaxis", "Levofloxacin prophylaxis"],
    treatmentHistory: ["7+3 induction (cytarabine + daunorubicin) completed 12 days ago"],
    todaysEncounter:
      "57-year-old female with AML, 12 days post-induction chemotherapy (cytarabine + daunorubicin), calls with new fever to 38.6°C at home this afternoon. Feels generally unwell but no localizing symptoms — no cough, no dysuria, no diarrhea. No rigors reported. She is currently at home, not yet evaluated in person. HR 104, BP 108/68.",
    structuredFields: {
      age: 57,
      sex: "female",
      cancerDiagnosis: "Acute myeloid leukemia",
      activeTreatment: "7+3 induction, day 12 post-chemo",
    },
  },
  {
    id: "case-3-back-pain",
    name: "Harold Chen",
    age: 68,
    sex: "M",
    diagnosis: "Metastatic prostate cancer (bone metastases)",
    currentTherapy: "Enzalutamide + ongoing ADT",
    overview: [
      "Known extensive osseous metastatic disease including lumbar spine.",
      "Baseline chronic low back pain, previously stable on acetaminophen.",
      "No prior cord compression episodes.",
    ],
    recentLabs: [
      { name: "Calcium", value: "9.8 mg/dL", date: "1 week ago" },
      { name: "Albumin", value: "3.9 g/dL", date: "1 week ago" },
    ],
    medications: ["Enzalutamide", "Leuprolide (ADT)", "Acetaminophen PRN"],
    treatmentHistory: ["ADT ongoing 2 years", "Enzalutamide added 6 months ago for progression"],
    todaysEncounter:
      "68-year-old male with metastatic prostate cancer and known lumbar spine metastases presents with new, severe back pain over the past 3 days, distinctly worse than his usual chronic pain, and new bilateral lower-extremity weakness noticed this morning when he had trouble standing. He also reports some difficulty initiating urination since yesterday. No saddle numbness reported yet — not specifically asked. No fever.",
    structuredFields: {
      age: 68,
      sex: "male",
      cancerDiagnosis: "Metastatic prostate cancer with bone metastases",
      activeTreatment: "Enzalutamide, ADT",
    },
  },
  {
    id: "case-4-chest-pain",
    name: "Linda Grabowski",
    age: 71,
    sex: "F",
    diagnosis: "Stage II breast cancer, post-lumpectomy",
    currentTherapy: "Adjuvant anastrozole",
    overview: [
      "Completed adjuvant radiation 4 months ago; now on anastrozole alone.",
      "History of hypertension and hyperlipidemia, former smoker (30 pack-years, quit 10 years ago).",
      "No known coronary artery disease.",
    ],
    recentLabs: [
      { name: "Troponin", value: "pending", date: "today" },
      { name: "Creatinine", value: "1.0 mg/dL", date: "3 months ago" },
    ],
    medications: ["Anastrozole", "Lisinopril", "Atorvastatin"],
    treatmentHistory: ["Lumpectomy 7 months ago", "Adjuvant radiation completed 4 months ago"],
    todaysEncounter:
      "71-year-old female with history of breast cancer on adjuvant anastrozole, hypertension, hyperlipidemia, and a 30 pack-year smoking history (quit 10 years ago), presents with chest pressure that started 2 hours ago while at rest, non-exertional, without clear radiation. No shortness of breath. HR 88, BP 152/88. ECG and troponin have been ordered but are not yet resulted.",
    structuredFields: {
      age: 71,
      sex: "female",
      cancerDiagnosis: "Stage II breast cancer",
      activeTreatment: "Adjuvant anastrozole",
    },
  },
  {
    id: "case-5-immunotherapy",
    name: "Marcus Webb",
    age: 54,
    sex: "M",
    diagnosis: "Metastatic melanoma",
    currentTherapy: "Nivolumab + ipilimumab (combination checkpoint inhibitor)",
    overview: [
      "Started combination checkpoint inhibitor therapy 6 weeks ago.",
      "No prior autoimmune disease.",
      "Baseline bowel habits normal prior to treatment.",
    ],
    recentLabs: [
      { name: "CRP", value: "42 mg/L", date: "today", flag: "high" },
      { name: "Creatinine", value: "0.8 mg/dL", date: "today" },
    ],
    medications: ["Nivolumab", "Ipilimumab", "Loperamide (started by patient, self-directed)"],
    treatmentHistory: ["Cycle 3 of combination checkpoint inhibitor therapy given 10 days ago"],
    todaysEncounter:
      "54-year-old male with metastatic melanoma on combination nivolumab and ipilimumab (cycle 3, 10 days ago) reports 6-7 episodes of watery diarrhea daily for the past 3 days, up from his normal 1 per day, with new mild diffuse abdominal pain. He has been taking over-the-counter loperamide without improvement. No blood in stool reported. No fever. He has not yet been evaluated for possible immune-mediated colitis.",
    structuredFields: {
      age: 54,
      sex: "male",
      cancerDiagnosis: "Metastatic melanoma",
      activeTreatment: "Nivolumab + ipilimumab, cycle 3",
    },
  },
];

export const demoPatientDataProvider = new MockPatientDataProvider(DEMO_CASES);
