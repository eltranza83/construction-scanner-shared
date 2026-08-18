/**
 * AI Tool Definitions & Function Declarations for Gemini Function Calling
 */

export const AI_TOOL_DECLARATIONS = [
  {
    name: 'get_vendor_history',
    description: 'Retrieve transaction history, invoices, and payments for a specific vendor, subcontractor, or contractor.',
    parameters: {
      type: 'OBJECT',
      properties: {
        vendorName: { type: 'STRING', description: 'Name of the vendor or contractor (e.g., Kike Vallejo, ABC Electric)' },
        projectId: { type: 'STRING', description: 'Optional project ID or lot identifier' }
      },
      required: ['vendorName']
    }
  },
  {
    name: 'get_subcontractor_balance',
    description: 'Retrieve the total quote, total amount paid, and remaining balance for a subcontractor or trade phase.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tradeOrContractor: { type: 'STRING', description: 'Trade category or contractor name (e.g. Electrician, Plumbing Rough-In, Concrete)' },
        projectId: { type: 'STRING', description: 'Optional project ID or lot identifier' }
      },
      required: ['tradeOrContractor']
    }
  },
  {
    name: 'search_receipts',
    description: 'Search recorded invoices, receipts, and payment transactions by keyword, date, or amount range.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Keyword search term (e.g., lumber, inspection, check #1042)' },
        minAmount: { type: 'NUMBER', description: 'Optional minimum total cost' },
        maxAmount: { type: 'NUMBER', description: 'Optional maximum total cost' },
        projectId: { type: 'STRING', description: 'Optional project ID' }
      }
    }
  },
  {
    name: 'get_project_schedule',
    description: 'Retrieve upcoming field reminders, trade calls, site watchouts, and inspection milestones.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: { type: 'STRING', description: 'Filter category: reminder, trade_call, watchout, or inspection' },
        projectId: { type: 'STRING', description: 'Optional project ID' }
      }
    }
  },
  {
    name: 'get_weather_for_jobsite',
    description: 'Fetch current weather conditions and 7-day forecast for the jobsite using Open-Meteo API.',
    parameters: {
      type: 'OBJECT',
      properties: {
        latitude: { type: 'NUMBER', description: 'Jobsite latitude (defaults to project coordinates if omitted)' },
        longitude: { type: 'NUMBER', description: 'Jobsite longitude (defaults to project coordinates if omitted)' },
        locationName: { type: 'STRING', description: 'City/Address or Lot location name' }
      }
    }
  },
  {
    name: 'get_project_budget',
    description: 'Retrieve the high-level budget breakdown, total spent, and budget variance by phase.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: { type: 'STRING', description: 'Cost category: material, labor, or all' },
        projectId: { type: 'STRING', description: 'Optional project ID' }
      }
    }
  },
  {
    name: 'get_drive_files',
    description: 'Search Google Drive project folders and files by folder name, keyword, or document type.',
    parameters: {
      type: 'OBJECT',
      properties: {
        folderName: { type: 'STRING', description: 'Target folder name (e.g. Planos, Invoices, Permits)' },
        keyword: { type: 'STRING', description: 'Search term for file title' }
      }
    }
  },
  {
    name: 'get_homeowner_specs',
    description: 'Retrieve homeowner finish specifications, selections, and paint schedules.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: { type: 'STRING', description: 'Category filter (e.g., Paint, Flooring, Plumbing Fixtures, Countertops)' },
        room: { type: 'STRING', description: 'Room location (e.g., Master Bath, Kitchen, Exterior)' }
      }
    }
  },
  {
    name: 'get_site_setup',
    description: 'Retrieve mobilization checklist status and site setup protocol requirements.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', description: 'Optional project ID' }
      }
    }
  }
];

/**
 * Execute weather tool lookup via Open-Meteo free API (no key needed).
 */
export async function executeWeatherTool({ latitude = 32.7767, longitude = -96.7970, locationName = 'Jobsite' }) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }
    const data = await res.json();
    return {
      location: locationName,
      current: {
        temperatureF: Math.round((data.current.temperature_2m * 9/5) + 32),
        temperatureC: data.current.temperature_2m,
        humidity: data.current.relative_humidity_2m,
        precipitationMm: data.current.precipitation,
        windSpeedMph: Math.round(data.current.wind_speed_10m * 0.621371)
      },
      dailyForecast: (data.daily?.time || []).slice(0, 5).map((date, idx) => ({
        date,
        maxTempF: Math.round((data.daily.temperature_2m_max[idx] * 9/5) + 32),
        minTempF: Math.round((data.daily.temperature_2m_min[idx] * 9/5) + 32),
        precipitationMm: data.daily.precipitation_sum[idx]
      }))
    };
  } catch (err) {
    return {
      location: locationName,
      error: `Could not retrieve live weather from Open-Meteo: ${err.message}`
    };
  }
}
