import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBlueprintAlbumPhotoFileName } from '../src/services/blueprintDrive.js';

test('buildBlueprintAlbumPhotoFileName sanitizes phase names', () => {
  assert.equal(
    buildBlueprintAlbumPhotoFileName('Paint & Tile', 'progress.photo.jpg', 12345),
    'Paint___Tile_Album_12345.jpg'
  );
});
