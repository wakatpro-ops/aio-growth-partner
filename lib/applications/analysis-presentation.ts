function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function listValue(value: unknown) {
  return Array.isArray(value) ? value.map(String).slice(0, 20) : [];
}

export function publicAnalysisPreview(input: { profile: unknown; diagnosis: unknown }) {
  const profile = recordValue(input.profile);
  const diagnosis = recordValue(input.diagnosis);
  const identification = recordValue(diagnosis.identification);
  const checkedSources = Array.isArray(diagnosis.checked_sources) ? diagnosis.checked_sources : [];
  const expectedOutcomes = Array.isArray(diagnosis.expected_outcomes) ? diagnosis.expected_outcomes : [];
  return {
    profile: {
      store_name: String(profile.store_name ?? ""),
      industry_label: String(profile.industry_label ?? ""),
      address: String(profile.address ?? "")
    },
    diagnosis: {
      business_summary: String(diagnosis.business_summary ?? ""),
      identification: {
        confidence: ["high", "medium"].includes(String(identification.confidence)) ? String(identification.confidence) : "low",
        label: String(identification.label ?? "店舗を確認しました"),
        reason: String(identification.reason ?? "")
      },
      research_status: diagnosis.research_status === "cross_checked" ? "cross_checked" : "input_only",
      checked_sources: checkedSources.flatMap((item) => {
        const source = recordValue(item);
        const url = String(source.url ?? "");
        if (!/^https?:\/\//iu.test(url)) return [];
        return [{ url, label: String(source.label ?? "公開ページ").slice(0, 80), kind: String(source.kind ?? "other") }];
      }).slice(0, 6),
      expected_outcomes: expectedOutcomes.flatMap((item) => {
        const outcome = recordValue(item);
        const title = String(outcome.title ?? "").slice(0, 120);
        const description = String(outcome.description ?? "").slice(0, 320);
        return title && description ? [{ title, description }] : [];
      }).slice(0, 5)
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
