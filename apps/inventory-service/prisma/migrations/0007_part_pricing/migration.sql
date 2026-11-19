ALTER TABLE parts
  ADD COLUMN cost_price numeric(14,2),
  ADD COLUMN standard_price numeric(14,2),
  ADD COLUMN currency varchar(3) NOT NULL DEFAULT 'VND',
  ADD COLUMN pricing_version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT parts_prices_valid CHECK (
    (cost_price IS NULL OR cost_price >= 0) AND
    (standard_price IS NULL OR standard_price >= 0) AND
    currency = 'VND' AND pricing_version > 0
  );
