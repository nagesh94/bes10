-- Site evidence gained a seventh required shot: the inverter's rating plate,
-- close enough to read the serial number off it. Placed next to the other
-- inverter shot rather than appended, so the stage 4 grids and the installer's
-- list stay in the order someone walks the site in.
ALTER TYPE "public"."photo_type" ADD VALUE 'INVERTER_SERIAL' BEFORE 'EARTHING_AC';
