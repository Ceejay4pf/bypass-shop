-- BYPASS SHOP — stock received 21/07/2026 (editable rows, not hardcoded)
-- 1 Front Bumper + 15 Rear Bumpers, identified by Part No.
-- nextval() keeps the app's own code generator in sync automatically.

insert into public.inventory
  (code, cat, brand, model, year_from, year_to, condition, side, name, price, qty, min_qty, location, notes, status, created_by)
values
  ('FBM-UNK-170-F-' || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'FBM', 'Unknown', '170', null, null, 'Genuine Used', 'Front', 'Front Bumper — Part No. 170', 0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-110-B-' || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '110', null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 110', 0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-212-B-' || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '212', null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 212', 0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-90-B-'  || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '90',  null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 90',  0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-47-B-'  || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '47',  null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 47',  0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-69-B-'  || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '69',  null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 69',  0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-73-B-'  || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '73',  null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 73',  0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-113-B-' || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '113', null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 113', 0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-57-B-'  || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '57',  null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 57',  0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-295-B-' || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '295', null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 295', 0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-85-B-'  || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '85',  null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 85',  0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-61-B-'  || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '61',  null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 61',  0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-60-B-'  || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '60',  null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 60',  0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-94-B-'  || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '94',  null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 94',  0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-12-B-'  || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '12',  null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 12',  0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau'),
  ('RBM-UNK-140-B-' || lpad(nextval('public.inventory_serial_seq')::text, 4, '0'), 'RBM', 'Unknown', '140', null, null, 'Genuine Used', 'Rear', 'Rear Bumper — Part No. 140', 0, 1, 1, 'Unassigned', 'Received 21/07/2026', 'Active', 'Josphat Kamau');
