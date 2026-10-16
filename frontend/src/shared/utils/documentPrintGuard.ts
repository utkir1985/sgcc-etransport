/** Tasdiqlanmagan QR (kulrang “QR” joyi) qolgan hujjatni chop etib bo‘lmaydi. */
export const PRINT_LOCKED_TITLE = 'Barcha QR kodlar tasdiqlangach chop etish mumkin';
export const ENTRY_PERMIT_PRINT_LOCKED_TITLE = 'Ruxsatnoma va smena boshlig‘i tasdiqlangach chop etish mumkin';

export function hasPendingApprovalQr(root: ParentNode): boolean {
  // Xizmat xati (kirish ruxsatnomasi) uchun:
  // Hujjat Qo'riqlash xizmati (NO'J)ga yetib kelganda (smena boshlig'i va ruxsatnoma byurosi tasdiqlagach),
  // Qo'riqlash hali tasdiqlamagan bo'lsa ham qog'ozga chop etishga ruxsat beriladi.
  const isEntryPermit = (root instanceof Element && root.classList.contains('entry-permit-document'))
    || Boolean((root as Element).querySelector?.('.entry-permit-document'));

  if (isEntryPermit) {
    const headApproved = Boolean(root.querySelector('.entry-permit-head__side--right.is-approved'));
    const signs = root.querySelectorAll('.yxn-signatures .yxn-sign');
    const permitApproved = Boolean(signs[1]?.classList.contains('is-approved'));
    // Agar smena boshlig'i yoki ruxsatnoma byurosi hali tasdiqlamagan bo'lsa, chop etish cheklanadi
    return !(headApproved && permitApproved);
  }

  return Boolean(
    root.querySelector(
      '.yxn-sign:not(.is-approved), .yxn-head__side--right:not(.is-approved), .entry-permit-head__side--right:not(.is-approved), .yxn-head-qr--pending',
    ),
  );
}
