import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { ROLES } from '../constants/roles.js';
import {
  getLeaveTypes,
  getLeaveCalculation,
  getMyLeaveBalances,
  submitLeaveRequest,
  getMyLeaveRequests,
  getPendingApprovals,
  getDepartmentLeaveSummary,
  getLeaveRequestById,
  decideLeaveRequest,
  cancelLeaveRequest,
  getAdminLeavePolicies,
  updateLeavePolicy,
} from '../controllers/leave.controller.js';

export const leaveRouter = Router();

// All leave operations require authentication
leaveRouter.use(authenticateToken);

// Types, calculation, and balances
leaveRouter.get('/types', getLeaveTypes);
leaveRouter.get('/calculate', getLeaveCalculation);
leaveRouter.get('/balances', getMyLeaveBalances);

// Requester endpoints
leaveRouter.get('/my', getMyLeaveRequests);
leaveRouter.post('/', submitLeaveRequest);

// HOD approval queue and department summary
leaveRouter.get('/approvals', requireRole(ROLES.HOD), getPendingApprovals);
leaveRouter.get('/department-summary', requireRole(ROLES.HOD), getDepartmentLeaveSummary);

// System Admin policy management
leaveRouter.get('/admin/policies', requireRole(ROLES.SYSTEM_ADMIN), getAdminLeavePolicies);
leaveRouter.put('/admin/policies/:id', requireRole(ROLES.SYSTEM_ADMIN), updateLeavePolicy);

// Specific request operations
leaveRouter.get('/:id', getLeaveRequestById);
leaveRouter.post('/:id/decision', requireRole(ROLES.HOD), decideLeaveRequest);
leaveRouter.post('/:id/cancel', cancelLeaveRequest);
