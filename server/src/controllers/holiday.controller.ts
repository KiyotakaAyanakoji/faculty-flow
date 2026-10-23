import { Request, Response } from 'express';
import { getIndianHolidays, HOLIDAY_DATASET_META } from '../services/holidays.service.js';

export async function listHolidays(req: Request, res: Response): Promise<void> {
  try {
    const yearParam = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

    const holidays = await getIndianHolidays({
      year: yearParam && !isNaN(yearParam) ? yearParam : undefined,
      startDate,
      endDate,
    });

    res.json({
      success: true,
      holidays: holidays.map(h => ({
        id: h.id,
        name: h.name,
        date: h.date,
        holidayDate: h.date,
        year: h.year,
        holidayType: h.holiday_type,
        category: h.holiday_type === 'National Holiday' ? 'National Holiday' : 'Festival',
        isGazetted: true,
        description: h.description,
        sourceKey: h.source_key,
        datasetSource: HOLIDAY_DATASET_META.source,
      })),
      total: holidays.length,
      dataset: {
        source: HOLIDAY_DATASET_META.source,
        yearsCovered: HOLIDAY_DATASET_META.coverageYears,
        coverageYears: HOLIDAY_DATASET_META.coverageYears,
        limitations: HOLIDAY_DATASET_META.limitations,
      },
      datasetMeta: HOLIDAY_DATASET_META,
    });
  } catch (error: any) {
    console.error('Error fetching Indian holidays:', error);
    res.status(500).json({ error: 'Failed to retrieve Indian holidays and festival data' });
  }
}
