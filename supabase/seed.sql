-- ============================================================
-- BYPASS SHOP — optional seed data
-- Run AFTER schema.sql if you want the demo inventory online.
-- Run in: Supabase Dashboard → SQL Editor. Safe to skip entirely.
-- ============================================================
insert into public.inventory
  (code, cat, brand, model, series, year_from, year_to, condition, side, variant, color, name, price, qty, min_qty, location, supplier)
values
  ('FBM-MZD-AXL-18-0001','FBM','Mazda','Axela','BM',2016,2018,'Genuine Used','Front',null,'Grey','Front Bumpers — Mazda Axela',8500,4,3,'A-R03-S02-B05',null),
  ('HDL-TOY-PRE-14-0002','HDL','Toyota','Premio','260',2014,2018,'Brand New','Right',null,'Clear','Headlights — Toyota Premio',12000,8,3,'D-R01-S01-B02',null),
  ('HDL-TOY-PRE-14-0003','HDL','Toyota','Premio','260',2014,2018,'Brand New','Left',null,'Clear','Headlights — Toyota Premio',12000,2,3,'D-R01-S01-B03',null),
  ('DOR-NIS-XTR-15-0004','DOR','Nissan','X-Trail','T32',2015,2020,'Genuine Used','Left',null,'White','Doors — Nissan X-Trail',18000,3,2,'B-R02-S01-B01',null),
  ('TLL-SUB-FOR-13-0005','TLL','Subaru','Forester','SJ',2013,2018,'Genuine Used','Right',null,'Red','Taillights — Subaru Forester',6500,9,3,'D-R02-S02-B01',null),
  ('SMI-TOY-FIE-16-0006','SMI','Toyota','Fielder','160',2016,2020,'Aftermarket','Right',null,'Silver','Side Mirrors — Toyota Fielder',4500,10,4,'G-R01-S01-B01',null),
  ('BNT-MZD-DEM-14-0007','BNT','Mazda','Demio','DJ',2014,2019,'Genuine Used','Not Applicable',null,'Blue','Bonnets — Mazda Demio',9000,3,2,'F-R01-S01-B01',null),
  ('RBM-HON-FIT-13-0008','RBM','Honda','Fit','GK',2013,2020,'Refurbished','Rear',null,'Black','Rear Bumpers — Honda Fit',7000,5,3,'C-R02-S01-B04',null),
  ('HDL-TOY-AUR-10-L-NX-0009','HDL','Toyota','Auris','150',2010,2012,'Genuine Used','Left','Non Xenon','Clear','Headlights — Toyota Auris (Non Xenon)',9500,7,3,'D-R01-S02-B01','Ex Japan')
on conflict (code) do nothing;

-- Advance the serial sequence past the seeded codes.
select setval('public.inventory_serial_seq', 9, true);
