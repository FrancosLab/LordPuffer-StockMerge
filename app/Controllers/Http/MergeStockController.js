'use strict'
const Helpers = use('Helpers')
const fs = require('fs-extra')
const removeFile = Helpers.promisify(fs.unlink)
const csv=require('csvtojson')
var json2csv = require('json2csv');

function toJSON(path) {
    return new Promise((resolve, reject) => {
        csv().fromFile(path).on('end_parsed', (json) => {
            return resolve(json);
        })
    })
}



class MergeStockController {
    async index({ request, response }) {
        try {
            await fs.remove(`${Helpers.tmpPath('uploads')}`)
        } catch (e) {
            console.log("wasn't able to remove folder", e);
        }
        const originalStock = request.file('originalStock')
        const updatedStock = request.file('updatedStock')
        await originalStock.move(Helpers.tmpPath('uploads'))
        await updatedStock.move(Helpers.tmpPath('uploads'))
        const ogJson = await toJSON(Helpers.tmpPath('uploads') + '/' + originalStock.toJSON().fileName);
        const upJson = await toJSON(Helpers.tmpPath('uploads') + '/' + updatedStock.toJSON().fileName);

        const updatedStockBySku = upJson.reduce((obj, product) => {
            const sku = product.skuId || product['sku Id'] || product['Sku Id'];
            
            if(sku) {
                if(obj[sku]) {
                    console.log('woah sku overlapped up: ', sku);
                }
                obj[sku] = product;
            }
            return obj;
        }, {});

        const updatedFile = ogJson.reduce((products, product) => {
            const sku = product['meta:purchase_sku'];
            if(sku) {
                const updatedProduct = updatedStockBySku[sku];
                if(updatedProduct) {
                    const msrp = updatedProduct['MSRP'] || updatedProduct['msrp'] || '0.00';
                    const min = updatedProduct['Min Advertised Price'] || updatedProduct['minAdvertisedPrice'];
                    const price = updatedProduct['Price'] || updatedProduct['price'];
                    const qty = updatedProduct.QuantityInStock || updatedProduct["Quantity In Stock"];

                    const updatedPrice = msrp.replace('$', '');
                    const minPrice = min.replace('$', '');
                    const buyingPrice = price.replace('$', '');
                    const stock = qty;
                    
                    // if(updatedPrice !== product['regular_price'] || minPrice !== product['sale_price'] || buyingPrice !== product["meta:buying_price"] || stock !== product['stock']) {
                        return [...products, {
                            sku: product.sku,
                            regular_price: updatedPrice,
                            sale_price: minPrice,
                            "meta:buying_price": buyingPrice,
                            "stock": stock,
                            "manage_stock": 'yes',
                            "stock_status": stock == 0 ? "outofstock" : "instock",
                            "in_store_only": !!product['in_store_only']
                        }];
                    // }
                }
            }  
        
            return products;
        }, []).filter(item => !!item);


        const downloadFile = `${Helpers.tmpPath('uploads')}/update.csv`;

        const csv = await json2csv({ data: updatedFile});
        await fs.outputFile(downloadFile, csv);
        await removeFile(Helpers.tmpPath('uploads') + '/' + originalStock.toJSON().fileName)
        await removeFile(Helpers.tmpPath('uploads') + '/' + updatedStock.toJSON().fileName)

        response.attachment(`${Helpers.tmpPath('uploads')}/update.csv`);
    }
}

module.exports = MergeStockController