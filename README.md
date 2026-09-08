# DualStreamRetinaWeb

Interactive, browser-based visualization of the retinal front end from **DualStreamBrains**.

**Live demo:** after GitHub Pages is enabled, this repository can be served directly from the `main` branch.

## Connection to DualStreamBrains

This repository is a lightweight visualization companion to the research code in:

- Original repository: https://github.com/minkyu-choi04/DualStreamBrains
- Paper: *A Dual-Stream Neural Network Explains the Functional Segregation of Dorsal and Ventral Visual Pathways in Human Brains* (NeurIPS 2023)
- Paper page: https://openreview.net/forum?id=Fy1S3v4UAk

The original project models vision from a retina-inspired front end into two functionally distinct neural-network pathways:

- **M-like / Where pathway** — broader spatial sampling, used by WhereCNN for visual attention.
- **P-like / What pathway** — more strongly foveated sampling near fixation, used by WhatCNN for object recognition.

The interactive webpage focuses only on the **retinal sampling and eye-movement illustration**. It is intentionally separated from the main research repository so the visualization can remain small, static, and easy to host with GitHub Pages.

## What this webpage implements

The demo:

- animates saccade-like eye movements across a scene;
- lets the user click anywhere to move fixation manually;
- visualizes sampling locations for both retinal pathways;
- shows the corresponding M-like / Where and P-like / What sampled views;
- lets the user adjust the retinal density ratios in real time;
- supports local image upload entirely inside the browser.

The retinal coordinate transform in `retina.js` is a JavaScript port of the fixation-centered radial transformation used by `make_xy2ret_grid_r` in `DualStreamBrains/neural_population.py`.

The default parameters follow the research repository:

- **Where / dorsal density ratio:** `2.5`
- **What / ventral density ratio:** `15.0`
- **Retinal output grid:** `64 × 64`

## Important implementation distinction

This is an explanatory visualization, not the full trained model running in the browser.

- The **retinal coordinate warp** follows the original research implementation.
- The automatic gaze sequence is an **illustrative scanpath**; it does not execute the trained WhereCNN.
- The full PyTorch preprocessing in `DualStreamBrains` applies staged fixation-dependent Gaussian foveation before warping. The webpage uses a lightweight browser-friendly approximation for the visual effect.
- No pretrained model weights, PyTorch runtime, backend server, or GPU are required.

The included example images are loaded from the original `DualStreamBrains` repository so that this visualization remains connected to the research project without duplicating those assets.

## Run locally

Because this is a static site, you can serve the repository with any simple HTTP server, for example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Publish with GitHub Pages

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Select the `main` branch and `/ (root)`.
4. Save.

The expected URL is:

```text
https://minkyu-choi04.github.io/DualStreamRetinaWeb/
```

## Files

- `index.html` — page structure and scientific explanation
- `styles.css` — responsive visual design
- `retina.js` — eye animation, retinal transformation, rendering, and image upload

## Privacy

Images uploaded through the webpage stay in the user's browser and are not sent to a server.
