-- Run only AFTER deploying the ToRailwayScale review support in API and frontend.
-- Exact 26 wagons authorized for restart on 2026-09-14. Existing waybills excluded.
-- Previous unit and arrival values are retained in the audit Details in this transaction.
BEGIN ISOLATION LEVEL SERIALIZABLE;
CREATE TEMP TABLE gross_restart_targets ON COMMIT DROP AS
SELECT u.* FROM "EmptyWagonUnits" u
WHERE u."WagonNumber" IN (
'24285488','50882000','50881739','58212887','58212457','58212572','58212846',
'58212630','58212804','74747668','50881820','50881903','58212549','50881655',
'58212440','58212705','23524283','50881838','58212606','58212937','58212713',
'50882059','73098659','73079519','73027989','73027609')
AND u."Status" IN ('Loaded','GrossWeighed','SealPending')
AND u."ScaleExitedAt" IS NULL
AND NOT EXISTS (
 SELECT 1 FROM "LoadingRegistries" r
 CROSS JOIN LATERAL jsonb_array_elements(r."WagonRoutesJson"::jsonb) w
 WHERE w->>'WagonNumber'=u."WagonNumber"
 AND COALESCE(NULLIF(w->>'SourceArrivalId','')::uuid,r."EmptyWagonArrivalId")=u."EmptyWagonArrivalId"
);
DO $$ BEGIN
 IF (SELECT count(*) FROM gross_restart_targets) <> 26 THEN
  RAISE EXCEPTION 'Expected exactly 26 unregistered loaded wagons. No changes applied.';
 END IF;
END $$;
INSERT INTO "AuditLogs" (
"Id","UserId","Username","UserFullName","UserRole","UserPosition","UserDepartment",
"IpAddress","UserAgent","Action","Category","Status","EntityType","EntityId","Details","CreatedAt")
SELECT gen_random_uuid(),NULL,'codex','Foydalanuvchi topshirig‘i asosida (Codex)','Automation','','',
'','','GrossReviewRestarted','Operations','Success','EmptyWagonUnit','gross-review-20260914',
jsonb_build_object('reason','User requested restart from gross/net review; preserve measured weights and seal numbers.',
'beforeUnits',(SELECT jsonb_agg(to_jsonb(t)) FROM gross_restart_targets t),
'beforeArrivals',(SELECT jsonb_agg(to_jsonb(a)) FROM "EmptyWagonArrivals" a WHERE a."Id" IN (SELECT "EmptyWagonArrivalId" FROM gross_restart_targets)))::text,now();
UPDATE "EmptyWagonUnits" u SET
"Status"='ToRailwayScale',"SealedAt"=NULL,
"SealConfirmedByScaleAt"=NULL,"SealConfirmedByScaleName"='',
"SealConfirmedBySecurityAt"=NULL,"SealConfirmedBySecurityName"='',
"SealConfirmedByEconomistAt"=NULL,"SealConfirmedByEconomistName"=''
FROM gross_restart_targets t WHERE u."Id"=t."Id";
UPDATE "EmptyWagonArrivals" SET "Stage"='ToRailwayScale'
WHERE "Id" IN (SELECT "EmptyWagonArrivalId" FROM gross_restart_targets);
SELECT u."Status",count(*) FROM "EmptyWagonUnits" u JOIN gross_restart_targets t ON t."Id"=u."Id" GROUP BY u."Status";
COMMIT;
