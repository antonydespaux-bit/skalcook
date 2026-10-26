-- L'historique client TheFork remonte avant 2015 (54 798 fiches pour 2010) :
-- import initial depuis 2005 par défaut.
ALTER TABLE public.crm_thefork_sync ALTER COLUMN import_depuis SET DEFAULT DATE '2005-01-01';
