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

        const updatedFile = ogJson.map(product => {
            const sku = product['meta:purchase_sku'];
            if(sku) {
                const updatedProduct = updatedStockBySku[sku];
                if(updatedProduct) {
                    const updatedPrice = updatedProduct['MSRP'].replace('$', '');
                    const minPrice = updatedProduct['Min Advertised Price'].replace('$', '');
                    const buyingPrice = updatedProduct['Price'].replace('$', '');
                    const stock = updatedProduct.QuantityInStock || updatedProduct["Quantity In Stock"];
                    
                    product['regular_price'] = updatedPrice;
                    product['sale_price'] = minPrice;
                    product['meta:buying_price'] = buyingPrice;
                    product['stock'] = stock;
                    product['manage_stock'] = 'yes';
                    stock == 0 ? product["stock_status"] = "outofstock" : product["stock_status"] = "instock"
                }
            }
            return product;
        });



        const csv = await json2csv({ data: updatedFile});
        
        fs.writeFile(`${Helpers.tmpPath('uploads')}/update.csv`, csv, function(err) {
          if (err) throw err;
          console.log('file saved');
        });

        await removeFile(Helpers.tmpPath('uploads') + '/' + originalStock.toJSON().fileName)
        await removeFile(Helpers.tmpPath('uploads') + '/' + updatedStock.toJSON().fileName)
        
        response.attachment(
            `${Helpers.tmpPath('uploads')}/update.csv`
        )
    }
}

module.exports = MergeStockController
