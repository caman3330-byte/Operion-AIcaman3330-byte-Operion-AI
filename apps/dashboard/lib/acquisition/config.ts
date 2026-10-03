export const ACQUISITION_CONFIG = {
  // Enabled/disabled
  enabled: true,
  provider: 'google_places',

  // Search configurations - progressive coverage
  searchPrograms: [
    {
      id: 'financial-services',
      industries: ['financial advisors', 'wealth management', 'insurance brokers'],
      locations: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Miami'],
      maxResultsPerSearch: 8,
      priority: 1,
    },
    {
      id: 'technology',
      industries: ['tech startups', 'software development', 'IT consulting'],
      locations: ['San Francisco', 'Seattle', 'Austin', 'Boston', 'Denver'],
      maxResultsPerSearch: 8,
      priority: 2,
    },
    {
      id: 'healthcare',
      industries: ['medical practices', 'dental offices', 'physical therapy'],
      locations: ['New York', 'Los Angeles', 'Dallas', 'Atlanta', 'Phoenix'],
      maxResultsPerSearch: 8,
      priority: 3,
    },
    {
      id: 'retail-commerce',
      industries: ['retail stores', 'e-commerce', 'shopping centers'],
      locations: ['New York', 'Los Angeles', 'Chicago', 'Dallas', 'Seattle'],
      maxResultsPerSearch: 8,
      priority: 4,
    },
  ],

  // Rate limiting and safety
  limits: {
    maxSearchesPerRun: 3,
    maxSearchesPerDay: 20,
    maxDiscoveriesPerDay: 160,
    delayBetweenSearchesMs: 500,
    apiTimeoutMs: 12000,
  },

  // Scheduling
  schedule: {
    // Runs at 2 AM, 8 AM, 2 PM, 8 PM UTC (every 6 hours)
    cronExpression: '0 2,8,14,20 * * *',
    description: 'Every 6 hours',
  },

  // Deduplication priority (strongest identifiers first)
  deduplicationPriority: [
    'google_place_id',
    'domain',
    'phone_normalized',
    'business_name_address_normalized',
  ],
};

export type AcquisitionConfigId = typeof ACQUISITION_CONFIG.searchPrograms[number]['id'];
