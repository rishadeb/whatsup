#%%
import katpoint
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator, MultipleLocator
from matplotlib.font_manager import FontProperties
import shelve
from astropy.time import Time
import csv
import datetime
# %%

class WhatsUp():
    sources = []
    source_names_list ={}
    filename = ""

    def __init__(self, filename):
        self.filename = filename
        self.read_csv()

    def read_csv(self):
        with open(self.filename, 'r') as file:
            csvreader = csv.reader(file, delimiter=',')
            for row in csvreader:
                self.sources.append(row)

        for index, row in enumerate(self.sources):
            self.source_names_list[row[0]] = index
            #print(row[0])

    def get_ra_dec(self,source_name):
        ra = self.sources[self.source_names_list[source_name]][2]
        dec = self.sources[self.source_names_list[source_name]][3]
        return ra.strip(), dec.strip()

    def get_current_time():
        # '2022-12-07 07:00:00'
        datetime_object = datetime.datetime.now()
        return datetime_object.strftime("%Y-%m-%d %H:%M:%S")

    def check_trajectory(self, duration, timeResolution, source_name):
        azim_list = []
        elev_list = []
        start_time = WhatsUp.get_current_time()
        ra_dec = self.get_ra_dec(source_name)
        target = katpoint.construct_radec_target(ra_dec[0], ra_dec[1])
        target.antenna = katpoint.Antenna('Khutunse, 5.750721, -0.304974, 116, 32.0')
        t = katpoint.Timestamp(start_time).secs + np.arange(0, duration, timeResolution)
        for c in t:
            elev = katpoint.rad2deg(target.azel(c)[1])
            azim = katpoint.rad2deg(target.azel(c)[0])
            azim_list.append(azim)
            elev_list.append(elev)
        return t, azim_list, elev_list

