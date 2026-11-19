CREATE TABLE processed_events (
  event_id uuid NOT NULL,
  consumer varchar(100) NOT NULL,
  event_type varchar(100) NOT NULL,
  processed_at timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, consumer)
);
