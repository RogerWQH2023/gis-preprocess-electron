import { protocol } from "electron";

import {
  LOCAL_COGTIFF_SCHEME,
  registerCogTiffPreviewIpc,
} from "./cogtiff-preview.js";
import {
  LOCAL_TILES_SCHEME,
  registerThreeDgsTilesPreviewIpc,
} from "./three-dgs-tiles-preview.js";

export { registerCogTiffPreviewIpc, registerThreeDgsTilesPreviewIpc };
export { registerBipToCogTiffIpc } from "./bip-to-cogtiff.js";
export { registerThreeDgsTilesIpc } from "./three-dgs-tiles.js";
export { bindWindowStateEvents, registerWindowIpc } from "./window.js";

export function registerLocalPreviewProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: LOCAL_COGTIFF_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
    {
      scheme: LOCAL_TILES_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}
