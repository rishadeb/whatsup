import tkinter
from source_manager import SourceManager
import katpoint
from matplotlib.backends.backend_tkagg import (FigureCanvasTkAgg,
                                               NavigationToolbar2Tk)
import matplotlib.pyplot as plt
from datetime import datetime
import random

import numpy as np


source_manager = SourceManager()
options = source_manager.source_names_list
sourcename = ""
NUM_COLORS = len(options)
colors = np.random.rand(len(options))
cm = plt.get_cmap("gist_rainbow")
root = tkinter.Tk()
root.wm_title("WHATS UP?")
root.geometry("900x900")


num_of_hours = tkinter.IntVar()
num_of_hours.set(10)
time_step_size = tkinter.IntVar()
time_step_size.set(30)
source_clicked = tkinter.StringVar()
source_clicked.set("Cyg A")
plot_selected = tkinter.StringVar()
plot_selected.set("Az/El")

# configure the grid
root.columnconfigure(0, weight=10)
# root.columnconfigure(1, weight=2)
root.columnconfigure(3, weight=10)


def _quit():
    root.quit()  # stops mainloop
    root.destroy()  # this is necessary on Windows to prevent
    # Fatal Python Error: PyEval_RestoreThread: NULL tstate


def update_graph(*args):
    az_el_textbox.delete("1.0", tkinter.END)

    legends = []
    global result
    global Fact
    hours = (
        num_of_hours.get()
        if ((num_of_hours.get() > 0) and (num_of_hours.get() < 60))
        else 10
    )
    step_size = time_step_size.get() if (time_step_size.get() > 0) else 10
    source_name = source_clicked.get()

    result = source_manager.check_trajectory(hours * 60 * 60, step_size * 60, source_name)
    ra.set(source_manager.get_ra_dec(source_clicked.get())[0])
    dec.set(source_manager.get_ra_dec(source_clicked.get())[1])

    azimuth_list = result[1]
    elevation_list = result[2]
    time_list = result[0]
    fig.clear()
    ax = fig.add_subplot(111)

    if plot_selected.get() == "Az/El":
        ax.scatter(azimuth_list, elevation_list)
        ax.set_xlabel("Azimuth (Degrees)")
        ax.set_ylabel("Elevation (Degrees)")
    if plot_selected.get() == "Az/time":
        ax.scatter([datetime.fromtimestamp(x) for x in time_list], azimuth_list)
        ax.set_ylabel("Azimuth (Degrees)")
        ax.set_xlabel("Time")
    if plot_selected.get() == "El/time":
        ax.scatter([datetime.fromtimestamp(x) for x in time_list], elevation_list)
        ax.set_ylabel("Elevation (Degrees)")
        ax.set_xlabel("Time")
    if plot_selected.get() == "All":
        ax.set_prop_cycle(color=[cm(1.0 * i / NUM_COLORS) for i in range(NUM_COLORS)])
        for i in source_manager.source_names_list:
            answer = source_manager.check_trajectory(
                num_of_hours.get() * 60 * 60, time_step_size.get() * 60, i
            )
            ax.scatter(answer[1], answer[2], alpha=0.7)
            ax.annotate(i, (random.choice(answer[1]), random.choice(answer[2])), size=6)
            legends.append(i)
        ax.legend(legends, bbox_to_anchor=(1.0, 1.15), prop={"size": 6})
        ax.axhline(0, color="black")  # y = 0
    canvas.draw()
    Fact = ""
    for x in range(0, len(result[1])):
        Fact += (
            "azimuth = "
            + str(result[1][x])
            + " \t elevation = "
            + str(result[2][x])
            + " \t "
            + katpoint.Timestamp(result[0][x]).to_string()
            + "\n"
        )
    az_el_textbox.insert(tkinter.END, Fact)


result = source_manager.check_trajectory(num_of_hours.get() * 60 * 60, 1800, source_clicked.get())
Fact = ""

selection_frame = tkinter.Frame(root)
# configure the grid
selection_frame.columnconfigure(0, weight=1)
# Source select drop down
source_clicked.trace("w", update_graph)
source_select = tkinter.OptionMenu(selection_frame, source_clicked, *options)
# source_select.pack()
source_select.grid(column=0, row=0, sticky=tkinter.E)

# Plot select drop down
plot_selected.trace("w", update_graph)
plot_options = {"Az/El", "El/time", "Az/time", "All"}  # Az/EL, time/EL, time/Az
plot_select = tkinter.OptionMenu(selection_frame, plot_selected, *plot_options)
plot_select.grid(column=1, row=0)
# plot_select.pack()
selection_frame.grid(column=1, row=0)


# Matplotlib figure
fig = plt.figure(figsize=(6.5, 5.5), dpi=100)
canvas = FigureCanvasTkAgg(fig, master=root)  # A tk.DrawingArea.
# canvas.get_tk_widget().pack(side=tkinter.TOP, fill=tkinter.BOTH, expand=1)
canvas.get_tk_widget().grid(column=0, row=1, columnspan=2, sticky=tkinter.EW)

toolbar_frame = tkinter.Frame(root)
toolbar_frame.grid(column=1, row=3)
toolbar = NavigationToolbar2Tk(canvas, toolbar_frame)
toolbar.update()
# canvas.get_tk_widget().pack(side=tkinter.TOP, fill=tkinter.BOTH, expand=1)

# RA DEC frame
co_ordinates_frame = tkinter.Frame(root)
ra_label = tkinter.Label(co_ordinates_frame, text="Right Ascension: ")
ra_label.grid(column=0, row=0)
ra = tkinter.StringVar()
dec = tkinter.StringVar()
ra_value = tkinter.Label(co_ordinates_frame, textvariable=ra, foreground="blue")
ra_value.grid(column=0, row=1)
dec_label = tkinter.Label(co_ordinates_frame, text="Declination: ")
dec_label.grid(column=0, row=2)
dec_value = tkinter.Label(co_ordinates_frame, textvariable=dec, foreground="blue")
dec_value.grid(column=0, row=3)
co_ordinates_frame.grid(column=2, row=1, sticky=tkinter.W)

setting_frame = tkinter.Frame(root)
setting_frame.columnconfigure(0, weight=1)
# Time interval Label
intervals_label = tkinter.Label(setting_frame, text="Hours: ")
intervals_label.grid(column=0, row=0)
# intervals_label.pack()
num_of_hours.trace("w", update_graph)

# Time interval entry box
intervals_entry = tkinter.Entry(setting_frame, textvariable=num_of_hours)
intervals_entry.grid(column=1, row=0)
# intervals_entry.pack()
# Time step label
resolution_label = tkinter.Label(setting_frame, text="Time Step Size (Minutes): ")
resolution_label.grid(column=2, row=0)
# resolution_label.pack()
time_step_size.trace("w", update_graph)
resolution_entry = tkinter.Entry(setting_frame, textvariable=time_step_size)
resolution_entry.grid(column=3, row=0)
# resolution_entry.pack()
setting_frame.grid(column=1, row=4)


# Create text widget and specify size.
az_el_textbox = tkinter.Text(root, height=10, width=90)
az_el_textbox.grid(column=1, row=5, pady=5, columnspan=1, sticky=tkinter.EW)

# Create label
az_el_label = tkinter.Label(root, text="Az/EL")
az_el_label.config(font=("Courier", 14))


root.protocol("WM_DELETE_WINDOW", _quit)

tkinter.mainloop()
