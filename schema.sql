CREATE TABLE app.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES app.rooms (id),
  scenario text NOT NULL,
  question text NOT NULL,
  mode text NOT NULL,
  options jsonb NOT NULL,
  deadline_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  result_index integer,
  verdict_text text,
  verdict_source text,
  verdict_status text NOT NULL DEFAULT 'none',
  verdict_started_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX cases_room_created_idx ON app.cases (room_id, created_at);

CREATE TABLE app.case_members (
  case_id uuid NOT NULL REFERENCES app.cases (id),
  voter_id uuid NOT NULL,
  nickname text NOT NULL,
  choice integer,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (case_id, voter_id)
);