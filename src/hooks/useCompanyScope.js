import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Central hook for multi-tenancy.
 * Returns the current user and their company_id.
 * All entity queries MUST use companyId to scope data.
 */
export function useCompanyScope() {
  const [me, setMe] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me()
      .then(user => {
        setMe(user);
        setCompanyId(user?.company_id || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /**
   * Returns a filter object that always includes company_id.
   * If the user has no company_id (super-admin), returns the extra filters only.
   */
  const scopeFilter = (extra = {}) => {
    if (!companyId) return extra; // super-admin sees everything
    return { company_id: companyId, ...extra };
  };

  /**
   * Scoped list: filter by company_id when available.
   */
  const scopedList = async (entity, sort = "-created_date", limit = 200, extra = {}) => {
    if (!companyId) return entity.list(sort, limit);
    return entity.filter({ company_id: companyId, ...extra }, sort, limit);
  };

  const isAdmin = me?.role === "admin";
  const isSuperAdmin = isAdmin && !companyId; // admin with no company = platform super-admin

  return { me, companyId, loading, scopeFilter, scopedList, isAdmin, isSuperAdmin };
}