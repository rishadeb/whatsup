
#%%
from astropy.coordinates import SkyCoord  # High-level coordinates
from astropy.coordinates import ICRS, Galactic, FK4, FK5  # Low-level frames
from astropy.coordinates import Angle, Latitude, Longitude  # Angles
import astropy.units as Units
from astropy.coordinates import EarthLocation
from astropy.coordinates import AltAz
from astropy.time import Time

grao = EarthLocation(lat=5.750686 * Units.deg, lon=-0.304977 * Units.deg, height=116 * Units.m)
time = Time('2022-12-08 14:15:19')
# %%
x = 5 # why not?
newAltAzcoordiantes = SkyCoord(alt = 19.90083360917372*Units.deg, az = 28.449122713957326*Units.deg, obstime = time, frame = 'altaz', location = grao)
newAltAzcoordiantes.icrs
newAltAzcoordiantes
# %%
from astroquery.simbad import Simbad
import astropy.coordinates as coord

limitedSimbad = Simbad()
limitedSimbad.ROW_LIMIT = 10
result_table = limitedSimbad.query_region(newAltAzcoordiantes.icrs, radius='1d0m0s')
print(result_table)
# %%
result_table = Simbad.query_object("Cas A")
print(result_table['RA'].value[0])
print(result_table['DEC'].value[0])

# %%
