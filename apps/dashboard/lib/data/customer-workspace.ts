import type { BusinessApplication, CrmActivity, DocumentRecord, FundingOffer, Profile } from "@operion/shared";
import { logger } from "@/lib/logger";
import { productionRepository } from "@/lib/repositories/production";
import { getServerSessionUser } from "@/lib/supabase/session";

export interface CustomerWorkspaceData {
  user: {
    id: string;
    email: string | null;
  } | null;
  profile: Profile | null;
  applications: BusinessApplication[];
  documents: DocumentRecord[];
  offers: FundingOffer[];
  activities: CrmActivity[];
  source: "supabase" | "unavailable";
}

export async function getCustomerWorkspaceData(): Promise<CustomerWorkspaceData> {
  const user = await getServerSessionUser();
  if (!user) {
    return emptyCustomerWorkspace(null);
  }

  try {
    await productionRepository.ensureProductionSchema();
    const applications = await productionRepository.listCustomerApplications(user.id);
    const [profile, documents, offers, activities] = await Promise.all([
      productionRepository.getProfile(user.id),
      productionRepository.listCustomerDocuments(user.id),
      productionRepository.listCustomerFundingOffers(applications.map((application) => application.id)),
      productionRepository.listCrmActivitiesForApplications(applications.map((application) => application.id))
    ]);

    return {
      user: {
        id: user.id,
        email: user.email ?? null
      },
      profile,
      applications,
      documents,
      offers,
      activities,
      source: "supabase"
    };
  } catch (error) {
    logger.warn("customer_workspace_unavailable", { error, userId: user.id });
    return emptyCustomerWorkspace({
      id: user.id,
      email: user.email ?? null
    });
  }
}

function emptyCustomerWorkspace(user: CustomerWorkspaceData["user"]): CustomerWorkspaceData {
  return {
    user,
    profile: null,
    applications: [],
    documents: [],
    offers: [],
    activities: [],
    source: "unavailable"
  };
}
