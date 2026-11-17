import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Product } from '../../src/lib/supabase';
import {
  isPublicStorefrontRoute,
  parseFrioganStorefrontMode,
  isFrioganProteinProduct,
  filterStorefrontProductsByFrioganMode,
  isOfferOrPromoProduct,
  resolveProductStorefrontPresentation,
  resolveStorefrontPrice,
  buildStorefrontCartItem,
  resolveRecipeBundleProducts,
} from '../../src/lib/storefront/storefrontEngine';
import { validateLeadExpressPayload } from '../../src/lib/storefront/storefrontContracts';
import { getParsedWeight } from '../../src/lib/orderUtils';

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: 'prod-1',
    sku: 'ACC-1',
    name: 'Tomate chonto',
    description: 'Fresco',
    unit_of_measure: 'Kg',
    image_url: '/tomate.jpg',
    category: 'VE',
    is_active: true,
    min_inventory_level: 10,
    show_on_web: true,
    ...overrides,
  };
}

describe('storefrontEngine — Core Domain & Friogan FSM', () => {
  it('1. parseFrioganStorefrontMode + isFrioganProteinProduct + filterStorefrontProductsByFrioganMode', () => {
    assert.strictEqual(parseFrioganStorefrontMode(undefined), 'OFF');
    assert.strictEqual(parseFrioganStorefrontMode(''), 'OFF');
    assert.strictEqual(parseFrioganStorefrontMode('invalid'), 'OFF');
    assert.strictEqual(parseFrioganStorefrontMode('teaser'), 'TEASER');
    assert.strictEqual(parseFrioganStorefrontMode('LIVE'), 'LIVE');

    const veg = makeProduct({ id: 'veg-1', name: 'Tomate chonto', category: 'VE' });
    const beefByCat = makeProduct({ id: 'cp-1', name: 'Lomo de res', category: 'CP' });
    const beefByGroup = makeProduct({
      id: 'cp-2',
      name: 'Punta de anca',
      category: 'DE',
      inventory_group: 'CAVA FRIOGAN',
    });
    const beefByTag = makeProduct({
      id: 'cp-3',
      name: 'Carne molida',
      category: 'DE',
      tags: ['Friogan', 'vacio'],
    });

    assert.strictEqual(isFrioganProteinProduct(veg), false);
    assert.strictEqual(isFrioganProteinProduct(beefByCat), true);
    assert.strictEqual(isFrioganProteinProduct(beefByGroup), true);
    assert.strictEqual(isFrioganProteinProduct(beefByTag), true);

    const all = [veg, beefByCat, beefByGroup, beefByTag];
    assert.deepStrictEqual(
      filterStorefrontProductsByFrioganMode(all, 'OFF').map((p) => p.id),
      ['veg-1']
    );
    assert.deepStrictEqual(
      filterStorefrontProductsByFrioganMode(all, 'TEASER').map((p) => p.id),
      ['veg-1']
    );
    assert.deepStrictEqual(
      filterStorefrontProductsByFrioganMode(all, 'LIVE').map((p) => p.id),
      ['veg-1', 'cp-1', 'cp-2', 'cp-3']
    );
  });

  it('2. resolveStorefrontPrice rejects base_price fallback, rounds up to $50 COP, and isOfferOrPromoProduct detects campaigns and tags', () => {
    const legacyOnlyBase = makeProduct({
      id: 'no-price',
      base_price: 9500,
      pricing_model_prices: [],
    });
    const vegPriced = makeProduct({
      id: 'priced-1',
      base_price: 1000, // must be ignored in favor of pricing_model_prices
      pricing_model_prices: [{ price: 4820, model_id: 'f7043ca1-94d5-4d25-bd10-fbf30ce120ee' }],
      tags: ['PROMOCION'],
      campaign_info: {
        campaignName: 'Cosecha',
        originalPrice: 5600,
        adjustmentValue: -14,
        type: 'margin_adjustment',
      },
    });
    const seasonalTagged = makeProduct({
      id: 'season-1',
      tags: ['temporada'],
    });

    const presMissing = resolveProductStorefrontPresentation(legacyOnlyBase, 'es');
    const missingRes = resolveStorefrontPrice(legacyOnlyBase, presMissing.defaultOption);
    assert.strictEqual(missingRes.isPriceAvailable, false);
    assert.strictEqual(missingRes.displayPrice, 0);

    const libraOption = resolveProductStorefrontPresentation(vegPriced, 'es').options.find(
      (o) => o.key === 'lb_500'
    )!;
    const priceLibra = resolveStorefrontPrice(vegPriced, libraOption);
    // 4820 * 0.5 = 2410 -> ceil to multiple of 50 = 2450
    assert.strictEqual(priceLibra.isPriceAvailable, true);
    assert.strictEqual(priceLibra.displayPrice, 2450);
    assert.strictEqual(priceLibra.originalDisplayPrice, 2800);
    assert.strictEqual(priceLibra.hasCampaignDiscount, true);

    assert.strictEqual(isOfferOrPromoProduct(legacyOnlyBase), false);
    assert.strictEqual(isOfferOrPromoProduct(vegPriced), true);
    assert.strictEqual(isOfferOrPromoProduct(seasonalTagged), true);
  });

  it('3. resolveProductStorefrontPresentation handles FIXED_VACUUM_PACK cleanly and getParsedWeight parses 1.000g as 1.0 kg', () => {
    const beef = makeProduct({
      id: 'beef-pack',
      accounting_id: 901,
      name: 'Lomo de Res al Vacío',
      category: 'CP',
      unit_of_measure: 'Kg',
      web_conversion_factor: 1,
      pricing_model_prices: [{ price: 42000 }],
      options_config: [{ name: 'Presentación', values: ['Paquete 500g|500', 'Paquete 1000g|1000'] }],
    });

    const pres = resolveProductStorefrontPresentation(beef, 'es');
    assert.strictEqual(pres.kind, 'FIXED_VACUUM_PACK');
    assert.strictEqual(pres.options.length, 2);
    assert.strictEqual(pres.options[0].cartUnit, 'Paquete 500g');
    assert.strictEqual(pres.options[1].cartUnit, 'Paquete 1000g');
    assert.strictEqual(pres.sealedWeightLabel?.includes('±'), false);
    assert.strictEqual(pres.sealedWeightLabel?.toLowerCase().includes('báscula'), false);

    const priceRes = resolveStorefrontPrice(beef, pres.options[1]);
    const cartItem = buildStorefrontCartItem(beef, pres.options[1], 2, pres.options.length, pres.kind, priceRes, 'es');
    assert.strictEqual(cartItem.unit, 'Paquete 1000g');
    assert.strictEqual(cartItem.weight_kg, 1);
    assert.strictEqual(cartItem.is_friogan, true);
    assert.strictEqual(cartItem.variant_label, 'Paquete 1.000g al vacío');

    assert.strictEqual(getParsedWeight('Paquete 1.000g'), 1);
    assert.strictEqual(getParsedWeight('1.000 g'), 1);
    assert.strictEqual(getParsedWeight('Paquete 1000g'), 1);
    assert.strictEqual(getParsedWeight('500g'), 0.5);
    assert.strictEqual(getParsedWeight('0.500g'), 0.0005);
    assert.strictEqual(getParsedWeight('1.5 kg'), 1.5);
  });

  it('4. isPublicStorefrontRoute excludes /checkout & admin/ops routes + validateLeadExpressPayload handles Colombian NIT for bigint', () => {
    assert.strictEqual(isPublicStorefrontRoute('/'), true);
    assert.strictEqual(isPublicStorefrontRoute('/products/123'), true);
    assert.strictEqual(isPublicStorefrontRoute('/b2b/register'), true);

    assert.strictEqual(isPublicStorefrontRoute('/checkout'), false);
    assert.strictEqual(isPublicStorefrontRoute('/admin/settings'), false);
    assert.strictEqual(isPublicStorefrontRoute('/ops/picking'), false);
    assert.strictEqual(isPublicStorefrontRoute('/b2b/dashboard'), false);
    assert.strictEqual(isPublicStorefrontRoute('/login'), false);
    assert.strictEqual(isPublicStorefrontRoute('/admin/orders/alistamiento-print'), false);

    const okRes = validateLeadExpressPayload({
      channel: 'B2B_EXPRESS',
      segment: 'HORECA',
      contact_name: 'Carlos Chef',
      phone: '310 555 1234',
      company_name: 'Bistró 93 SAS',
      nit: '900.123.456-7',
      email: 'CARLOS@BISTRO93.CO',
      municipality: 'Chía',
    });
    assert.strictEqual(okRes.ok, true);
    if (okRes.ok) {
      assert.strictEqual(okRes.data.nit, 900123456);
      assert.strictEqual(okRes.data.phone, '3105551234');
      assert.strictEqual(okRes.data.email, 'carlos@bistro93.co');
      assert.strictEqual(okRes.data.address, 'Chía');
    }

    const badPhone = validateLeadExpressPayload({
      channel: 'FRIOGAN_TEASER',
      contact_name: 'Ana',
      phone: '12345',
    });
    assert.strictEqual(badPhone.ok, false);
  });

  it('5. resolveRecipeBundleProducts omits unpriced items and gates Friogan cuts behind LIVE mode', () => {
    const papa = makeProduct({
      id: 'r-1',
      name: 'Papa criolla',
      pricing_model_prices: [{ price: 4000 }],
    });
    const guascas = makeProduct({
      id: 'r-2',
      name: 'Guascas',
      pricing_model_prices: [], // missing price -> omitted
      base_price: 2000,
    });
    const mazorca = makeProduct({
      id: 'r-3',
      name: 'Mazorca sabanera',
      pricing_model_prices: [{ price: 3200 }],
    });
    const pechugaFriogan = makeProduct({
      id: 'r-4',
      name: 'Pechuga de pollo Friogan',
      category: 'CP',
      pricing_model_prices: [{ price: 18500 }],
    });

    const catalog = [papa, guascas, mazorca, pechugaFriogan];

    const offBundle = resolveRecipeBundleProducts(catalog, 'ajiaco', 'OFF', 'es');
    assert.deepStrictEqual(
      offBundle.map((i) => i.product.id),
      ['r-1', 'r-3']
    );

    const teaserBundle = resolveRecipeBundleProducts(catalog, 'ajiaco', 'TEASER', 'es');
    assert.deepStrictEqual(
      teaserBundle.map((i) => i.product.id),
      ['r-1', 'r-3']
    );

    const liveBundle = resolveRecipeBundleProducts(catalog, 'ajiaco', 'LIVE', 'es');
    assert.deepStrictEqual(
      liveBundle.map((i) => i.product.id),
      ['r-1', 'r-3', 'r-4']
    );
  });

  it('6. validateLeadExpressPayload rejects non-string types, SQL/letter injection in NIT, negative NIT, and invalid phones', () => {
    assert.strictEqual(
      validateLeadExpressPayload({ channel: 'B2B_EXPRESS', contact_name: { hack: true }, phone: '3105551234' }).ok,
      false
    );
    assert.strictEqual(
      validateLeadExpressPayload({ channel: 'B2B_EXPRESS', contact_name: 'Ana Ruiz', phone: '310abc1234' }).ok,
      false
    );
    assert.strictEqual(
      validateLeadExpressPayload({ channel: 'B2B_EXPRESS', contact_name: 'Ana Ruiz', phone: '3105551234', nit: '900ABC1234' }).ok,
      false
    );
    assert.strictEqual(
      validateLeadExpressPayload({ channel: 'B2B_EXPRESS', contact_name: 'Ana Ruiz', phone: '3105551234', nit: -900123456 }).ok,
      false
    );
    assert.strictEqual(
      validateLeadExpressPayload({ channel: 'B2B_EXPRESS', contact_name: 'Ana Ruiz', phone: '3105551234', nit: '900123; DROP TABLE leads' }).ok,
      false
    );
  });
});
