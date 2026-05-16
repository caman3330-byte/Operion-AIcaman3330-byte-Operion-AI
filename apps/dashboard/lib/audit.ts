import type { ActorType, EntityType, Json } from "@operion/shared";
import { auditLogRepository } from "@/lib/repositories/audit-log";

interface WriteAuditLogInput {
  eventType: string;
  actorType: ActorType;
  actorId?: string | null;
  entityType: EntityType;
  entityId?: string | null;
  beforeState?: Json | null;
  afterState?: Json | null;
  metadata?: Json | null;
  ipAddress?: string | null;
}

export async function writeAuditLog(input: WriteAuditLogInput) {
  return auditLogRepository.create({
    event_type: input.eventType,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_state: input.beforeState ?? null,
    after_state: input.afterState ?? null,
    metadata: input.metadata ?? null,
    ip_address: input.ipAddress ?? null
  });
}
