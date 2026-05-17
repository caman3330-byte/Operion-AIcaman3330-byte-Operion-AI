import type {
  AiTask,
  BusinessApplication,
  CrmActivity,
  DocumentRecord,
  FundingOffer,
  LenderMatch,
  Profile,
  UnderwritingReview
} from "@operion/shared";
import { productionRepository } from "@/lib/repositories/production";

export interface MerchantPipelineData {
  applications: BusinessApplication[];
  counts: Record<string, number>;
}

export interface MerchantProfileData {
  application: BusinessApplication;
  profile: Profile | null;
  documents: DocumentRecord[];
  offers: FundingOffer[];
  activities: CrmActivity[];
  lenderMatches: LenderMatch[];
  underwritingReviews: UnderwritingReview[];
  aiTasks: AiTask[];
}

export async function getMerchantPipelineData(): Promise<MerchantPipelineData> {
  const applications = await productionRepository.listBusinessApplications(250);
  const counts = applications.reduce<Record<string, number>>((acc, application) => {
    acc[application.status] = (acc[application.status] ?? 0) + 1;
    return acc;
  }, {});

  return { applications, counts };
}

export async function getMerchantProfileData(applicationId: string): Promise<MerchantProfileData> {
  const application = await productionRepository.getBusinessApplication(applicationId);
  const [profile, documents, offers, activities, lenderMatches, underwritingReviews, aiTasks] = await Promise.all([
    application.profile_id ? productionRepository.getProfile(application.profile_id) : Promise.resolve(null),
    productionRepository.listDocumentsForApplication(applicationId),
    productionRepository.listCustomerFundingOffers([applicationId]),
    productionRepository.listCrmActivitiesForApplications([applicationId]),
    productionRepository.listLenderMatchesForApplications([applicationId]),
    productionRepository.listUnderwritingReviewsForApplications([applicationId]),
    productionRepository.listAiTasksForApplications([applicationId])
  ]);

  return {
    application,
    profile,
    documents,
    offers,
    activities,
    lenderMatches,
    underwritingReviews,
    aiTasks
  };
}
