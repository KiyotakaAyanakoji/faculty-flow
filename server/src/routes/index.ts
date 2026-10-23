import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { userRouter } from './user.routes.js';
import { departmentRouter } from './department.routes.js';
import { taskRouter } from './task.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { syllabusRouter } from './syllabus.routes.js';
import { handoverRouter } from './handover.routes.js';
import { eventRouter } from './event.routes.js';
import { leaveRouter } from './leave.routes.js';
import { holidayRouter } from './holiday.routes.js';
import { personalEventRouter } from './personal-event.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/departments', departmentRouter);
apiRouter.use('/tasks', taskRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/syllabus', syllabusRouter);
apiRouter.use('/handovers', handoverRouter);
apiRouter.use('/events', eventRouter);
apiRouter.use('/leaves', leaveRouter);
apiRouter.use('/holidays', holidayRouter);
apiRouter.use('/personal-events', personalEventRouter);



