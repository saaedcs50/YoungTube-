/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-970124e6'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "0f280f52a3d2277aba79fb1f42651536"
  }, {
    "url": "pwa-512x512.png",
    "revision": "0f280f52a3d2277aba79fb1f42651536"
  }, {
    "url": "pwa-192x192.png",
    "revision": "fab41d56ab9f44a8611e088c2d891592"
  }, {
    "url": "og-image.png",
    "revision": "a28b0cfb28569a76a72f7432ccf22403"
  }, {
    "url": "index.html",
    "revision": "c5bc9535b92c1df6a93462c80ef81fcc"
  }, {
    "url": "icon.svg",
    "revision": "a369c0f27465a27aafb9aaacad116718"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "3e74e084dcd35492412a72b247017e6d"
  }, {
    "url": "fonts/cairo-900.woff2",
    "revision": "b34585d26b8d60aa53d3b4ddadce74d8"
  }, {
    "url": "fonts/cairo-800.woff2",
    "revision": "9a551df16ccbc31f2df41ceb34c02881"
  }, {
    "url": "fonts/cairo-700.woff2",
    "revision": "2ee9fa708606728e5ad5fd62c487557a"
  }, {
    "url": "fonts/cairo-600.woff2",
    "revision": "8744448544b1538b0dbf34c0921ea6aa"
  }, {
    "url": "fonts/cairo-500.woff2",
    "revision": "8e4929526f5fe83ae849f010082f6412"
  }, {
    "url": "fonts/cairo-400.woff2",
    "revision": "07d5c872f7b7f939dc3362a6e9d05e13"
  }, {
    "url": "assets/workbox-window.prod.es5-BBnX5xw4.js",
    "revision": null
  }, {
    "url": "assets/user-B9InaCjD.js",
    "revision": null
  }, {
    "url": "assets/smartphone-CZUMPYvO.js",
    "revision": null
  }, {
    "url": "assets/sliders-vertical-CaQ1iIC4.js",
    "revision": null
  }, {
    "url": "assets/shield-check-cEp1SbJz.js",
    "revision": null
  }, {
    "url": "assets/shield-alert-R8z7izqe.js",
    "revision": null
  }, {
    "url": "assets/rotate-ccw-DTHilXJk.js",
    "revision": null
  }, {
    "url": "assets/plus-DciMKUoK.js",
    "revision": null
  }, {
    "url": "assets/moon-BrM_DOmO.js",
    "revision": null
  }, {
    "url": "assets/layers-COAcTsJn.js",
    "revision": null
  }, {
    "url": "assets/info-Bp9vXFUc.js",
    "revision": null
  }, {
    "url": "assets/index-ClthDRL9.css",
    "revision": null
  }, {
    "url": "assets/index-CTL6pcpv.js",
    "revision": null
  }, {
    "url": "assets/funnelTelemetry-S2rdWxug.js",
    "revision": null
  }, {
    "url": "assets/fast-forward-BgmMbxas.js",
    "revision": null
  }, {
    "url": "assets/external-link-Xj4gfJh3.js",
    "revision": null
  }, {
    "url": "assets/clock-COIp--7u.js",
    "revision": null
  }, {
    "url": "assets/check-BaDwvZjZ.js",
    "revision": null
  }, {
    "url": "assets/bookmark-Bql-VJNp.js",
    "revision": null
  }, {
    "url": "assets/arrow-left-CcJR3EZu.js",
    "revision": null
  }, {
    "url": "assets/WelcomeValueScreen-B5TPMkfg.js",
    "revision": null
  }, {
    "url": "assets/TimerTestCard-DW4yZya_.js",
    "revision": null
  }, {
    "url": "assets/TimerSection-BbGoda6O.js",
    "revision": null
  }, {
    "url": "assets/TasteShiftCard-6D5nKwr7.js",
    "revision": null
  }, {
    "url": "assets/SessionEndScreen-BijZ0BHf.js",
    "revision": null
  }, {
    "url": "assets/SavedVideosTab-Du5HXfM5.js",
    "revision": null
  }, {
    "url": "assets/PostSetupChecklist-BAsCRvS4.js",
    "revision": null
  }, {
    "url": "assets/PlayerView-JDZyribP.js",
    "revision": null
  }, {
    "url": "assets/PinOtpInput-DFlWCbiC.js",
    "revision": null
  }, {
    "url": "assets/PinLockModal-bAfxDAT5.js",
    "revision": null
  }, {
    "url": "assets/Onboarding-BWZAEJxl.js",
    "revision": null
  }, {
    "url": "assets/FilteringTab-B103YZX4.js",
    "revision": null
  }, {
    "url": "assets/FilteringResultCard-BN1yqlCN.js",
    "revision": null
  }, {
    "url": "assets/DashboardShell-tjaSkmVk.js",
    "revision": null
  }, {
    "url": "assets/ChildProfileSection-CHUVjmsz.js",
    "revision": null
  }, {
    "url": "assets/ChannelsCountCard-CXKQZmrS.js",
    "revision": null
  }, {
    "url": "assets/ChannelCurationByCategory-BRQ8YcaK.js",
    "revision": null
  }, {
    "url": "assets/AnnouncementModal-CbEcr_6_.js",
    "revision": null
  }, {
    "url": "assets/AddByUrlCard-Dq1a5-1r.js",
    "revision": null
  }, {
    "url": "assets/AdBlockNotice-ByyTiVnE.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "3e74e084dcd35492412a72b247017e6d"
  }, {
    "url": "icon.svg",
    "revision": "a369c0f27465a27aafb9aaacad116718"
  }, {
    "url": "pwa-192x192.png",
    "revision": "fab41d56ab9f44a8611e088c2d891592"
  }, {
    "url": "pwa-512x512.png",
    "revision": "0f280f52a3d2277aba79fb1f42651536"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "0f280f52a3d2277aba79fb1f42651536"
  }, {
    "url": "manifest.webmanifest",
    "revision": "b0350eac813ba8d34ee9121b23bbce14"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/.*\.workers\.dev\/(api\/|channels-latest).*/i, new workbox.NetworkFirst({
    "cacheName": "worker-api-cache",
    "networkTimeoutSeconds": 3,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 86400
    }), new workbox.CacheableResponsePlugin({
      statuses: [200]
    })]
  }), 'GET');

}));
