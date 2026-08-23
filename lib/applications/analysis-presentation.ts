function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function listValue(value: unknown) {
  return Array.isArray(value) ? value.map(String).slice(0, 20) : [];
}

export function publicAnalysisPreview(input: { profile: unknown; diagnosis: unknown }) {
  const profile = recordValue(input.profile);
  const diagnosis = recordValue(input.diagnosis);
  const topImprovement = recordValue(diagnosis.top_improvement);
  return {
    profile: {
      store_name: String(profile.store_name ?? ""),
      industry_label: String(profile.industry_label ?? ""),
      address: String(profile.address ?? "")
    },
    diagnosis: {
      business_summary: String(diagnosis.business_summary ?? ""),
      readiness_score: Number(diagnosis.readiness_score ?? 0),
      top_improvement: {
        key: String(topImprovement.key ?? ""),
        title: String(topImprovement.title ?? ""),
        description: String(topImprovement.description ?? "")
      }
    }
  };
}

export function approvedAnalysisDetail(input: { profile: unknown; diagnosis: unknown; sourceUrl: unknown; finalUrl: unknown; status: unknown; aiStatus: unknown }) {
  const profile = recordValue(input.profile);
  const diagnosis = recordValue(input.diagnosis);
  return {
    status: String(input.status ?? "partial"),
    source_url: String(input.sourceUrl ?? ""),
    final_url: String(input.finalUrl ?? ""),
    ai_status: String(input.aiStatus ?? "fallback"),
    profile: {
      store_name: String(profile.store_name ?? ""),
      company_name: String(profile.company_name ?? ""),
      industry_key: String(profile.industry_key ?? "other_service"),
      industry_label: String(profile.industry_label ?? ""),
      address: String(profile.address ?? ""),
      phone: String(profile.phone ?? ""),
      opening_hours: String(profile.opening_hours ?? ""),
      description: String(profile.description ?? ""),
      services: listValue(profile.services),
      strengths: listValue(profile.strengths),
      target_customers: listValue(profile.target_customers),
      social_urls: listValue(profile.social_urls),
      source_urls: listValue(profile.source_urls),
      field_origins: recordValue(profile.field_origins)
    },
    diagnosis: {
      business_summary: String(diagnosis.business_summary ?? ""),
      readiness_score: Number(diagnosis.readiness_score ?? 0),
      readiness_items: Array.isArray(diagnosis.readiness_items) ? diagnosis.readiness_items.slice(0, 20) : [],
      target_questions: listValue(diagnosis.target_questions).slice(0, 3),
      top_improvement: recordValue(diagnosis.top_improvement),
      clarifying_questions: Array.isArray(diagnosis.clarifying_questions) ? diagnosis.clarifying_questions.slice(0, 3) : [],
      recommended_modules: Array.isArray(diagnosis.recommended_modules) ? diagnosis.recommended_modules.slice(0, 20) : []
    }
  };
}
