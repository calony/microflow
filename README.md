# Microflow

A GitHub Pages deployment of [dred36/microflow](https://github.com/dred36/microflow).

[Open Microflow](https://calony.github.io/microflow/)

## MicroFlow quick start

MicroFlow lets you build a microfabrication process and see a simulated **cross-section**, or side view, of the wafer after each step.

1. **Load an example.** In the top toolbar, choose **Presets → Self-Aligned CMOS Poly-Si Gate Process**. [Open MicroFlow](https://calony.github.io/microflow/)
2. **Step through the flow.** Click the starting wafer and then the steps in the **Process Traveller** on the left. Watch how deposition adds a film, lithography patterns the resist, and etching removes exposed material.
3. **Try one edit.** Select **LPCVD Polysilicon Deposition** and change **Film Thickness** from **350 nm** to **500 nm** (or **0.35 µm** to **0.50 µm**). The cross-section updates as you edit. Click the later etch step to see how the thicker film affects the result.
4. **Save your work.** Hover over the toolbar’s download icon and look for **Export Recipe JSON**. The `.json` file is an editable copy you can share or reopen with **Import Recipe JSON**.
5. **Download a video.** Click **Download Video (MP4)** below the Process Traveller’s playback controls. It exports the starting wafer and every enabled step at the selected playback speed as a 720p H.264 MP4 video for Windows or Mac. Progress and Cancel are available while the video is created.

When you’re ready to build your own flow, choose **Presets → Blank Process Flow**, then **Add Step at End of Flow**. Export your current recipe first if you want to keep it, since loading a preset replaces the active flow. The toolbar’s **Help** covers masks, measurements, and figure exports.
