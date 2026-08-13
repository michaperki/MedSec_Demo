import type { StructuredInputFields } from "./llm";

export interface LabRow {
  name: string;
  value: string;
  date: string;
  flag?: "high" | "low" | "critical";
}

/**
 * A synthetic chart record shaped like what a SMART-on-FHIR launch context
 * could eventually provide. For this prototype, `todaysEncounter` (plus
 * `structuredFields`) is what actually feeds the safety-check pipeline — a
 * future FHIRPatientDataProvider would populate the same shape from real
 * chart data, either by synthesizing an encounter summary or by populating
 * structuredFields directly from FHIR resources.
 */
export interface MockChartRecord {
  id: string;
  name: string;
  age: number;
  sex: string;
  diagnosis: string;
  currentTherapy: string;
  overview: string[];
  recentLabs: LabRow[];
  medications: string[];
  treatmentHistory: string[];
  todaysEncounter: string;
  structuredFields?: StructuredInputFields;
}

export interface PatientDataProvider {
  listPatients(): Promise<MockChartRecord[]>;
  getPatient(id: string): Promise<MockChartRecord>;
}

export class MockPatientDataProvider implements PatientDataProvider {
  constructor(private records: MockChartRecord[]) {}

  async listPatients(): Promise<MockChartRecord[]> {
    return this.records;
  }

  async getPatient(id: string): Promise<MockChartRecord> {
    const record = this.records.find((r) => r.id === id);
    if (!record) throw new Error(`No mock patient with id "${id}"`);
    return record;
  }
}
