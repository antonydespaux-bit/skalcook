-- Réquisitions, étape 6 : livraison atomique.
--
-- Le préparateur valide la livraison d'une réquisition : en une transaction,
--   * l'en-tête passe à « livree » (seulement depuis « a_preparer » ou
--     « en_preparation » : une demande annulée entre-temps n'est pas livrée) ;
--   * chaque ligne reçoit sa quantité livrée (éventuellement 0 si le stock
--     manque) et son prix unitaire HT figé ;
--   * les produits ajoutés « à la voix » deviennent des lignes
--     ajoutee_par_preparateur.
-- Les contrôles (droits, catalogue, prix) sont faits par l'API avant
-- l'appel ; la fonction est réservée au service_role.
--
-- Retour : le numéro du bon, ou NULL si son statut ne permettait plus la
-- livraison (rien n'est modifié).
-- p_lignes : [{id, quantite_livree, prix_unitaire}]  — toutes les lignes du bon
-- p_ajouts : [{ingredient_id | article_id, nom, unite, quantite_livree,
--              prix_unitaire, commentaire}]

CREATE OR REPLACE FUNCTION public.requisition_livrer(
  p_client uuid,
  p_id uuid,
  p_preparateur uuid,
  p_lignes jsonb,
  p_ajouts jsonb DEFAULT '[]'::jsonb
)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_numero integer;
  v_lignes integer;
  v_maj integer;
  v_ordre integer;
begin
  update public.requisitions r
     set statut = 'livree',
         livree_at = now(),
         preparateur_id = p_preparateur,
         prise_en_charge_at = coalesce(r.prise_en_charge_at, now())
   where r.id = p_id and r.client_id = p_client
     and r.statut in ('a_preparer', 'en_preparation')
  returning r.numero into v_numero;

  if v_numero is null then
    return null;
  end if;

  -- Toutes les lignes existantes doivent être servies (0 accepté).
  select count(*) into v_lignes from public.requisition_lignes l
   where l.requisition_id = p_id and l.client_id = p_client;
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) <> v_lignes then
    raise exception 'Chaque ligne de la réquisition doit avoir une quantité livrée.' using errcode = '22023';
  end if;

  update public.requisition_lignes l
     set quantite_livree = (x.val->>'quantite_livree')::numeric,
         prix_unitaire = nullif(x.val->>'prix_unitaire', '')::numeric
    from jsonb_array_elements(p_lignes) as x(val)
   where l.id = (x.val->>'id')::uuid
     and l.requisition_id = p_id
     and l.client_id = p_client;
  get diagnostics v_maj = row_count;
  if v_maj <> v_lignes then
    raise exception 'Lignes de réquisition incohérentes.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_ajouts) = 'array' and jsonb_array_length(p_ajouts) > 0 then
    select coalesce(max(l.ordre), 0) into v_ordre from public.requisition_lignes l
     where l.requisition_id = p_id;
    insert into public.requisition_lignes (
      requisition_id, client_id, ordre, ingredient_id, article_id, nom, unite,
      quantite_demandee, quantite_livree, prix_unitaire, ajoutee_par_preparateur, commentaire
    )
    select p_id, p_client, v_ordre + a.ord::integer,
           nullif(a.val->>'ingredient_id', '')::uuid,
           nullif(a.val->>'article_id', '')::uuid,
           a.val->>'nom',
           a.val->>'unite',
           null,
           (a.val->>'quantite_livree')::numeric,
           nullif(a.val->>'prix_unitaire', '')::numeric,
           true,
           nullif(a.val->>'commentaire', '')
      from jsonb_array_elements(p_ajouts) with ordinality as a(val, ord);
  end if;

  return v_numero;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.requisition_livrer(uuid, uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requisition_livrer(uuid, uuid, uuid, jsonb, jsonb) TO service_role;
