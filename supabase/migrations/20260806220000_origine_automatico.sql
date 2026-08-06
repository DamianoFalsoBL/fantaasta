-- Terzo valore per l'origine di un'offerta: quelle piazzate dal sistema per
-- conto di chi ha dichiarato un tetto automatico.
--
-- Sta da solo in una migration sua per una ragione precisa: `ALTER TYPE ... ADD
-- VALUE` non consente di USARE il nuovo valore nella stessa transazione in cui
-- viene aggiunto, e la CLI Supabase esegue ogni file dentro una transazione.
-- Accorpandolo alla migration che lo impiega, il push fallirebbe.

ALTER TYPE public.origine_offerta ADD VALUE IF NOT EXISTS 'AUTOMATICO';
