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

  const isAdmin = me?.role === "admin";
  // Super-admin da plataforma: flag explícita (usada pelo RLS no servidor) ou,
  // por compatibilidade, admin sem empresa vinculada
  const isSuperAdmin = me?.is_super_admin === true || (isAdmin && !companyId);

  /**
   * Returns a filter object that always includes company_id.
   * Only the platform super-admin gets an unscoped filter.
   */
  const scopeFilter = (extra = {}) => {
    if (isSuperAdmin) return extra;
    return { company_id: companyId, ...extra };
  };

  /**
   * Scoped list: filter by company_id. Users without a company (and that are
   * not super-admin) get nothing — never an unscoped list.
   */
  const scopedList = async (entity, sort = "-created_date", limit = 200, extra = {}) => {
    if (isSuperAdmin) return entity.list(sort, limit);
    if (!companyId) return [];
    return entity.filter({ company_id: companyId, ...extra }, sort, limit);
  };

  return { me, companyId, loading, scopeFilter, scopedList, isAdmin, isSuperAdmin };
}