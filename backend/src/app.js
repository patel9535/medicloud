import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import passport from 'passport';
import { checkDatabase } from './db.js';
import { authRouter } from './auth/routes.js';
import { patientRouter } from './patients/routes.js';
import { doctorRouter } from './doctors/routes.js';
import { appointmentRouter } from './appointments/routes.js';
import { medicalRecordRouter, prescriptionRouter } from './medical-records/routes.js';
import { documentRouter } from './documents/routes.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
app.use(passport.initialize());
app.use('/api/documents', express.raw({ type: ['application/pdf', 'image/png', 'image/jpeg'], limit: '10mb' }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_request, response) => {
  response.json({ status: 'healthy' });
});

app.get('/ready', async (_request, response) => {
  try {
    await checkDatabase();
    response.json({ status: 'ready' });
  } catch {
    response.status(503).json({ status: 'not_ready' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/patients', patientRouter);
app.use('/api/doctors', doctorRouter);
app.use('/api/appointments', appointmentRouter);
app.use('/api/medical-records', medicalRecordRouter);
app.use('/api/prescriptions', prescriptionRouter);
app.use('/api/documents', documentRouter);

app.use('/api', (_request, response) => {
  response.status(404).json({ success: false, data: null, message: 'Route not found.' });
});

app.use((error, _request, response, _next) => {
  // Do not return internal error details or request content to clients.
  if (error.status === 413 || error.type === 'entity.too.large') {
    return response.status(413).json({ success: false, data: null, message: 'Files must be 10 MB or smaller.' });
  }
  response.status(500).json({ success: false, data: null, message: 'Internal server error.' });
});
