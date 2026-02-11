# Blender headless processor for equipment weight transfer
# Uses NEAREST_FACE_INTERPOLATED data transfer for gold-standard skinning
#
# Built from Ubuntu + official Blender tarball for true headless operation.
# Platform: linux/amd64 (runs via Rosetta on Apple Silicon)

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install minimal dependencies for Blender headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    xz-utils \
    unzip \
    libx11-6 \
    libxi6 \
    libxxf86vm1 \
    libxfixes3 \
    libxrender1 \
    libgl1-mesa-glx \
    libxkbcommon0 \
    libsm6 \
    && rm -rf /var/lib/apt/lists/*

# Download and install Blender 4.2 LTS from official tarball
ENV BLENDER_VERSION=4.2.4
ENV BLENDER_URL=https://download.blender.org/release/Blender4.2/blender-${BLENDER_VERSION}-linux-x64.tar.xz

RUN curl -L "${BLENDER_URL}" -o /tmp/blender.tar.xz && \
    tar -xf /tmp/blender.tar.xz -C /opt/ && \
    mv /opt/blender-${BLENDER_VERSION}-linux-x64 /opt/blender && \
    ln -s /opt/blender/blender /usr/local/bin/blender && \
    rm /tmp/blender.tar.xz

# Verify Blender works headless
RUN blender --background --python-expr "import bpy; print('Blender', bpy.app.version_string, 'headless OK')"

# Install VRM addon for Blender 4.2
# Tag uses dots (v3.19.3), filename uses underscores (3_19_3)
# The zip extracts to VRM_Addon_for_Blender-release/ — rename to match module name
ENV VRM_ADDON_TAG=v3.19.3
ENV VRM_ADDON_FILE=VRM_Addon_for_Blender-3_19_3.zip
RUN mkdir -p /tmp/vrm-addon && \
    curl -L "https://github.com/saturday06/VRM-Addon-for-Blender/releases/download/${VRM_ADDON_TAG}/${VRM_ADDON_FILE}" \
    -o /tmp/vrm-addon/vrm-addon.zip && \
    mkdir -p /root/.config/blender/4.2/scripts/addons && \
    unzip /tmp/vrm-addon/vrm-addon.zip -d /root/.config/blender/4.2/scripts/addons/ && \
    mv /root/.config/blender/4.2/scripts/addons/VRM_Addon_for_Blender-release \
       /root/.config/blender/4.2/scripts/addons/VRM_Addon_for_Blender && \
    rm -rf /tmp/vrm-addon

# Enable VRM addon and verify it loads
RUN blender --background --python-expr "\
import bpy; \
bpy.ops.preferences.addon_enable(module='VRM_Addon_for_Blender'); \
bpy.ops.wm.save_userpref(); \
print('VRM addon enabled successfully')"

# Copy pipeline scripts
COPY scripts/ /app/scripts/

WORKDIR /app

ENTRYPOINT ["blender", "--background", "--python", "/app/scripts/process_equipment.py", "--"]
