import { useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRbacStore } from '../../modules/admin/rbacStore';

/** Rolning amal (CRUD) ruxsatini tekshiradi — faqat Rollar va Huquqlar sozlamasidan. */
export function useRbacPermission() {
  const { user } = useAuth();
  const { state } = useRbacStore();

  const role = user?.role ?? '';

  const can = useCallback((actionKey: string) => {
    if (!role) return false;
    const action = state.actions.find(a => a.key === actionKey);
    if (!action) return false;
    return action.roles.some(r => r.toLowerCase() === role.toLowerCase());
  }, [role, state.actions]);

  const permissions = useMemo(() => ({
    // Buyurtmalar
    canCreateOrder: can('orders.create'),
    canReadOrder: can('orders.read'),
    canUpdateOrder: can('orders.update'),
    canDeleteOrder: can('orders.delete'),
    canSubmitApproval: can('orders.submit-approval'),
    canResubmitRejected: can('orders.resubmit'),
    canAccountingSave: can('orders.accounting-save'),
    canAccountingFinalize: can('orders.accounting-finalize'),
    canApproveDeputy: can('orders.approve-deputy'),
    canApproveDispatch: can('orders.approve-dispatch'),
    canSubmitDispatch: can('orders.submit-dispatch'),

    // Bo'sh vagonlar / Kirish
    canCreateEmptyWagon: can('empty-wagons.create'),
    canReadEmptyWagon: can('empty-wagons.read'),
    canUpdateEmptyWagon: can('empty-wagons.update'),
    canDeleteEmptyWagon: can('empty-wagons.delete'),
    canEntryPermit: can('empty-wagons.entry-permit'),
    canSecurityInspect: can('empty-wagons.security-inspect'),
    canPermitAgree: can('empty-wagons.permit-agree'),
    canDispatchApprove: can('empty-wagons.dispatch-approve'),
    canTransferEstakada: can('empty-wagons.transfer-estakada'),
    canDefectAct: can('empty-wagons.defect-act'),

    // Yuklash / Tarozi / Plomba
    canTareWeigh: can('flow.tare-weigh'),
    canLoading: can('flow.loading'),
    canGrossWeigh: can('flow.gross-weigh'),
    canSealWarehouse: can('flow.seal-warehouse'),
    canSealScale: can('flow.seal-scale'),
    canSealSecurity: can('flow.seal-security'),
    canSealEdit: can('flow.seal-edit'),

    // Yuk xatlari (Reyestr)
    canRegistryCreate: can('documents.registry.create'),
    canRegistryRead: can('documents.registry.read'),
    canRegistryUpdate: can('documents.registry.update'),
    canRegistryDelete: can('documents.registry.delete'),
    canRegistryApproveShift: can('documents.registry.approve-shift'),
    canRegistryApproveEconomist: can('documents.registry.approve-economist'),
    canRegistryApproveSecurity: can('documents.registry.approve-security'),
    canRegistryApprovePermit: can('documents.registry.approve-permit'),
    canRegistrySendExternal: can('documents.registry.send-external'),
    canRegistryHandover: can('documents.registry.handover'),

    // Avtotransport
    canRoadCreate: can('road.create'),
    canRoadRead: can('road.read'),
    canRoadUpdate: can('road.update'),
    canRoadDelete: can('road.delete'),
    canRoadWeighTare: can('road.weigh-tare'),
    canRoadLoading: can('road.loading'),
    canRoadWeighGross: can('road.weigh-gross'),
    canRoadGateExit: can('road.gate-exit'),

    // Normativ hujjatlar
    canNormativeRead: can('normative-docs.read'),
    canNormativeCreate: can('normative-docs.create'),
    canNormativeUpdate: can('normative-docs.update'),
    canNormativeDelete: can('normative-docs.delete'),

    // Sfera Balance (tashqi tizim paneli)
    canSferaView: can('sfera.view'),

    // Ma'lumotnomalar
    canProductsCreate: can('products.create'),
    canProductsRead: can('products.read'),
    canProductsUpdate: can('products.update'),
    canProductsDelete: can('products.delete'),

    canContractorsCreate: can('contractors.create'),
    canContractorsRead: can('contractors.read'),
    canContractorsUpdate: can('contractors.update'),
    canContractorsDelete: can('contractors.delete'),

    canStationsCreate: can('stations.create'),
    canStationsRead: can('stations.read'),
    canStationsUpdate: can('stations.update'),
    canStationsDelete: can('stations.delete'),

    canWagonTypesCreate: can('wagon-types.create'),
    canWagonTypesRead: can('wagon-types.read'),
    canWagonTypesUpdate: can('wagon-types.update'),
    canWagonTypesDelete: can('wagon-types.delete'),

    canFleetWagonsCreate: can('fleet-wagons.create'),
    canFleetWagonsRead: can('fleet-wagons.read'),
    canFleetWagonsUpdate: can('fleet-wagons.update'),
    canFleetWagonsDelete: can('fleet-wagons.delete'),

    canDestinationsCreate: can('destinations.create') || can('stations.create'),
    canDestinationsRead: can('destinations.read') || can('stations.read'),
    canDestinationsUpdate: can('destinations.update') || can('stations.update'),
    canDestinationsDelete: can('destinations.delete') || can('stations.delete'),

    // Foydalanuvchilar va Rollar
    canUsersCreate: can('users.create') || can('admin.users'),
    canUsersRead: can('users.read') || can('admin.users'),
    canUsersUpdate: can('users.update') || can('admin.users'),
    canUsersDelete: can('users.delete') || can('admin.users'),

    canRolesCreate: can('roles.create') || can('admin.roles'),
    canRolesRead: can('roles.read') || can('admin.roles'),
    canRolesUpdate: can('roles.update') || can('admin.roles'),
    canRolesDelete: can('roles.delete') || can('admin.roles'),

    canTransportRead: can('transport.read'),
    canHistoryRead: can('history.read'),
    canReportsRead: can('reports.read') || can('reports.analytics'),
    canReportsAnalytics: can('reports.analytics') || can('reports.read'),

    // Admin sozlamalari
    canAdminIntegrations: can('admin.integrations') || role === 'Admin',
    canAdminAudit: can('admin.audit') || role === 'Admin',
    canAdminServerStatus: can('admin.server-status') || role === 'Admin',
  }), [can, role]);

  return { can, role, ...permissions };
}
