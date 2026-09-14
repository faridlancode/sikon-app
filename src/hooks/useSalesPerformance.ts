import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useSalesPerformance() {
  const [performance, setPerformance] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPerformance = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales_performance')
      .select('*')
      .order('total_revenue', { ascending: false });

    if (!error) setPerformance(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPerformance();
  }, [fetchPerformance]);

  return { performance, loading, refetch: fetchPerformance };
}
