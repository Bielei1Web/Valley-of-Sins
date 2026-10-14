    const SUPABASE_URL = 'https://bksinlttbejnbwasxfff.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_a14OJ_HqhPEZSTC57P4FgA_iv2IbChs';
    
    if (!window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    const supabaseClient = window.supabaseClient;

    const LOW_STOCK_THRESHOLD = 5;
