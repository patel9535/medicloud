CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('PATIENT', 'DOCTOR', 'ADMIN')),
  app_id_user_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth date,
  gender text,
  phone text,
  address text,
  emergency_contact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  specialization text NOT NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  license_number text NOT NULL UNIQUE,
  phone text,
  experience_years integer NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
  availability jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED')),
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX appointments_active_slot_unique ON appointments (doctor_id, appointment_date, appointment_time)
  WHERE status IN ('PENDING', 'CONFIRMED', 'COMPLETED');
CREATE INDEX appointments_patient_date_idx ON appointments (patient_id, appointment_date DESC);
CREATE INDEX appointments_doctor_date_idx ON appointments (doctor_id, appointment_date, appointment_time);

CREATE TABLE medical_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  appointment_id uuid UNIQUE REFERENCES appointments(id) ON DELETE SET NULL,
  diagnosis text NOT NULL,
  symptoms text,
  notes text,
  follow_up_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX medical_records_patient_created_idx ON medical_records (patient_id, created_at DESC);
CREATE INDEX medical_records_doctor_idx ON medical_records (doctor_id);

CREATE TABLE prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_record_id uuid NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
  medicine text NOT NULL,
  dosage text NOT NULL,
  frequency text NOT NULL,
  duration text NOT NULL,
  instructions text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prescriptions_record_idx ON prescriptions (medical_record_id);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  object_storage_key text NOT NULL UNIQUE,
  file_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_patient_created_idx ON documents (patient_id, created_at DESC);
