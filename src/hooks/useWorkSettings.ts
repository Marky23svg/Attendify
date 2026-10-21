import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface WorkSettings {
  work_start_time: string;
  work_end_time: string;
  grace_period_minutes: number;
}

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  work_start_time: '08:00:00',
  work_end_time: '17:00:00',
  grace_period_minutes: 15,
};

const toWorkSettings = (row: Partial<WorkSettings> | null): WorkSettings => ({
  work_start_time: row?.work_start_time ?? DEFAULT_WORK_SETTINGS.work_start_time,
  work_end_time: row?.work_end_time ?? DEFAULT_WORK_SETTINGS.work_end_time,
  grace_period_minutes:
    row?.grace_period_minutes ?? DEFAULT_WORK_SETTINGS.grace_period_minutes,
});

export function useWorkSettings() {
  const [settings, setSettings] = useState<WorkSettings>(DEFAULT_WORK_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('work_start_time, work_end_time, grace_period_minutes')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        console.error('Work settings fetch error:', error);
        return;
      }

      if (data) {
        setSettings(toWorkSettings(data));
      }
    } catch (err) {
      console.error('Work settings load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    return fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    fetchSettings();

    const channel = supabase
      .channel(`settings-changes-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'settings',
          filter: 'id=eq.1',
        },
        (payload) => {
          setSettings(toWorkSettings(payload.new as Partial<WorkSettings>));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSettings]);

  return { settings, loading, reload };
}
