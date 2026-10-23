import { pool } from '../config/database.js';

export interface IndianHolidayRecord {
  id: number;
  name: string;
  date: string;
  year: number;
  holiday_type: 'National Holiday' | 'Gazetted Festival';
  description: string | null;
  source_key: string;
}

export const HOLIDAY_DATASET_META = {
  source: 'Government of India Ministry of Personnel, Public Grievances and Pensions (Department of Personnel and Training) Gazetted Holidays',
  coverageYears: [2025, 2026, 2027],
  limitations: 'Covers mandatory central National Holidays and Gazetted religious/cultural festivals. Optional/restricted state-specific holidays vary by state government and institutional autonomy.',
};

/**
 * Retrieve Indian holidays and gazetted festivals from MySQL.
 */
export async function getIndianHolidays(params: {
  year?: number;
  startDate?: string;
  endDate?: string;
}): Promise<IndianHolidayRecord[]> {
  const conditions: string[] = [];
  const queryParams: any[] = [];

  if (params.year) {
    conditions.push('year = ?');
    queryParams.push(params.year);
  }

  if (params.startDate) {
    conditions.push('date >= ?');
    queryParams.push(params.startDate.slice(0, 10));
  }

  if (params.endDate) {
    conditions.push('date <= ?');
    queryParams.push(params.endDate.slice(0, 10));
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT id, name, DATE_FORMAT(date, '%Y-%m-%d') as date, year, holiday_type, description, source_key
    FROM indian_holidays
    ${whereClause}
    ORDER BY date ASC
  `;

  const [rows] = await pool.query<any[]>(query, queryParams);
  return rows;
}
