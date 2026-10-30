import { createClient } from '@supabase/supabase-js';

const url = 'https://fqznaoiwainliizszcsd.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxem5hb2l3YWlubGlpenN6Y3NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0Njk1MjcsImV4cCI6MjEwNzA0NTUyN30.M_1o2k1_78GP_-OYXGIheGFuOkwndzuOU_hUNHPE0po';

const client = createClient(url, anonKey);

async function checkMarketingTables() {
  const tables = [
    'marketing_members',
    'marketing_attendance',
    'marketing_breaks',
    'marketing_tasks',
    'marketing_content_posts',
    'marketing_daily_reports',
    'marketing_company_settings',
    'people',
    'jobs'
  ];

  for (const t of tables) {
    const { error, count } = await client.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`Table ${t}: NOT FOUND or ERROR: ${error.message} (${error.code})`);
    } else {
      console.log(`Table ${t}: EXISTS (count: ${count})`);
    }
  }
}

checkMarketingTables();
