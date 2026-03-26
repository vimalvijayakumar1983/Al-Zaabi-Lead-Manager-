/** Fired on window when sidebar division changes (same tab). Detail matches localStorage `activeDivisionId`. */
export const ACTIVE_DIVISION_CHANGED = 'leadflow:activeDivision';

export type ActiveDivisionChangedDetail = { divisionId: string | null };
