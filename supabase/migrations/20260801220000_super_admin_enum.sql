-- Aggiunge il ruolo SUPER_ADMIN all'enum.
--
-- ATTENZIONE: questa migration deve restare DA SOLA nel proprio file.
-- PostgreSQL non permette di usare un valore enum appena aggiunto nella stessa
-- transazione che lo ha aggiunto ("unsafe use of new value of enum type").
-- Il vecchio fase8_super_admin.sql mescolava ALTER TYPE e utilizzo nello stesso
-- script: da lì è partita la cascata di fix falliti fase9 -> fase22.

ALTER TYPE public.ruolo_utente ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

-- Stesso motivo: 'PERSO' serve ad admin_risolvi_busta_pari per marcare le buste
-- perdenti di un ballottaggio. fase9 lo usava senza averlo mai aggiunto
-- all'enum, quindi quella funzione non poteva funzionare.
ALTER TYPE public.esito_busta ADD VALUE IF NOT EXISTS 'PERSO';
