-- Normalize legacy `presigned` → plan-aligned `pending_put` (client not yet finished PUT).
UPDATE media_pipeline_object SET state = 'pending_put' WHERE state = 'presigned';
