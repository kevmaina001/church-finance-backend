const mongoose = require('mongoose');
const Income = require('../models/Income');
const Expenditure = require('../models/Expenditure');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const moment = require('moment');

// Fetch report data for income and expenditure
exports.getReports = async (req, res) => {
  try {
    const { type, filter, startDate, endDate } = req.query;
    if (!['income', 'expenditure'].includes(type)) {
      return res.status(400).json({ message: 'Invalid report type' });
    }
    let query = { tenantId: req.user.tenantId };
    // Optional scope to a single local church
    if (req.query.localChurch) query.localChurch = req.query.localChurch;
    if (type === 'income') {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59.999Z')
      };
    } else {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59.999Z')
      };
    }
    let records;
    if (type === 'income') {
      records = await Income.find(query).populate('revenueSource').sort({ date: -1 });
    } else {
      records = await Expenditure.find(query).populate('votehead').sort({ createdAt: -1 });
    }
    res.status(200).json({ records });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Fetch aggregated data for reports
exports.getAggregatedReports = async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    if (!['income', 'expenditure'].includes(type)) {
      return res.status(400).json({ message: 'Invalid report type' });
    }
    // aggregate() does not auto-cast strings to ObjectId the way find() does,
    // so tenantId must be cast explicitly or the $match returns nothing.
    let matchStage = { tenantId: new mongoose.Types.ObjectId(req.user.tenantId) };
    // Optional scope to a single local church
    if (req.query.localChurch) matchStage.localChurch = new mongoose.Types.ObjectId(req.query.localChurch);
    if (type === 'income') {
      matchStage.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59.999Z')
      };
    } else {
      matchStage.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59.999Z')
      };
    }
    let groupField, lookupField, model;
    if (type === 'income') {
      groupField = 'revenueSource';
      lookupField = 'revenuesources';
      model = Income;
    } else {
      groupField = 'votehead';
      lookupField = 'voteheads';
      model = Expenditure;
    }
    const aggregatedData = await model.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: `$${groupField}`,
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $lookup: {
          from: lookupField,
          localField: '_id',
          foreignField: '_id',
          as: 'details'
        }
      },
      {
        $project: {
          name: { $arrayElemAt: ['$details.name', 0] },
          totalAmount: 1,
          _id: 0
        }
      },
      { $sort: { name: 1 } }
    ]);
    res.status(200).json({ aggregatedData });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Download reports in PDF or Excel format
exports.downloadReport = async (req, res) => {
  try {
    const { type, format, startDate, endDate } = req.query;
    let query = { tenantId: req.user.tenantId };
    // Optional scope to a single local church
    if (req.query.localChurch) query.localChurch = req.query.localChurch;
    if (type === 'income') {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59.999Z')
      };
    } else {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59.999Z')
      };
    }
    let records;
    if (type === 'income') {
      records = await Income.find(query).populate('revenueSource').sort({ date: -1 });
    } else {
      records = await Expenditure.find(query).populate('votehead').sort({ createdAt: -1 });
    }
    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${type}_report.pdf`);
      doc.pipe(res);
      doc.fontSize(20).text(`${type.charAt(0).toUpperCase() + type.slice(1)} Report`, { align: 'center' });
    doc.moveDown();
      doc.fontSize(12).text(`Period: ${moment(startDate).format('MMM D, YYYY')} - ${moment(endDate).format('MMM D, YYYY')}`, { align: 'center' });
      doc.moveDown();
      const headers = ['Date', type === 'income' ? 'Revenue Source' : 'Votehead', 'Amount', 'Description'];
      const columnWidths = [100, 150, 100, 200];
      let y = 150;
      doc.fontSize(10);
      headers.forEach((header, i) => {
        doc.text(header, 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), y);
      });
      y += 20;
      records.forEach(record => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
        doc.text(moment(record.createdAt).format('MMM D, YYYY'), 50, y);
        doc.text(type === 'income' ? record.revenueSource?.name || 'N/A' : record.votehead?.name || 'N/A', 150, y);
        doc.text(record.amount.toFixed(2), 300, y);
        doc.text(record.description || 'N/A', 400, y);
        y += 20;
      });
      const total = records.reduce((sum, record) => sum + record.amount, 0);
      doc.moveDown();
      doc.fontSize(12).text(`Total: ${total.toFixed(2)}`, { align: 'right' });
    doc.end();
    } else {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`${type} Report`);
      worksheet.mergeCells('A1:D1');
      worksheet.getCell('A1').value = `${type.charAt(0).toUpperCase() + type.slice(1)} Report`;
      worksheet.getCell('A1').font = { size: 16, bold: true };
      worksheet.getCell('A1').alignment = { horizontal: 'center' };
      worksheet.mergeCells('A2:D2');
      worksheet.getCell('A2').value = `Period: ${moment(startDate).format('MMM D, YYYY')} - ${moment(endDate).format('MMM D, YYYY')}`;
      worksheet.getCell('A2').alignment = { horizontal: 'center' };
      const headers = ['Date', type === 'income' ? 'Revenue Source' : 'Votehead', 'Amount', 'Description'];
      worksheet.addRow(headers);
      worksheet.getRow(3).font = { bold: true };
      worksheet.getRow(3).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      records.forEach(record => {
        worksheet.addRow([
          moment(record.createdAt).format('MMM D, YYYY'),
          type === 'income' ? record.revenueSource?.name || 'N/A' : record.votehead?.name || 'N/A',
          record.amount,
          record.description || 'N/A'
        ]);
      });
      const total = records.reduce((sum, record) => sum + record.amount, 0);
      worksheet.addRow(['', '', total, '']);
      worksheet.getCell(`C${records.length + 4}`).font = { bold: true };
      worksheet.getColumn(1).width = 15;
      worksheet.getColumn(2).width = 25;
      worksheet.getColumn(3).width = 15;
      worksheet.getColumn(4).width = 40;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${type}_report.xlsx`);
    await workbook.xlsx.write(res);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Download aggregated reports in PDF or Excel format
exports.downloadAggregatedReport = async (req, res) => {
  try {
    const { type, format, startDate, endDate } = req.query;
    const matchStage = {
      // Cast tenantId to ObjectId — aggregate() does not auto-cast like find().
      tenantId: new mongoose.Types.ObjectId(req.user.tenantId),
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59.999Z')
      }
    };
    // Optional scope to a single local church
    if (req.query.localChurch) matchStage.localChurch = new mongoose.Types.ObjectId(req.query.localChurch);
    let groupField, lookupField, model;
    if (type === 'income') {
      groupField = 'revenueSource';
      lookupField = 'revenuesources';
      model = Income;
    } else {
      groupField = 'votehead';
      lookupField = 'voteheads';
      model = Expenditure;
    }
    const aggregatedData = await model.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: `$${groupField}`,
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $lookup: {
          from: lookupField,
          localField: '_id',
          foreignField: '_id',
          as: 'details'
        }
      },
      {
        $project: {
          name: { $arrayElemAt: ['$details.name', 0] },
          totalAmount: 1,
          _id: 0
        }
      },
      { $sort: { name: 1 } }
    ]);
    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${type}_aggregated_report.pdf`);
      doc.pipe(res);
      doc.fontSize(20).text(`${type.charAt(0).toUpperCase() + type.slice(1)} Summary Report`, { align: 'center' });
    doc.moveDown();
      doc.fontSize(12).text(`Period: ${moment(startDate).format('MMM D, YYYY')} - ${moment(endDate).format('MMM D, YYYY')}`, { align: 'center' });
      doc.moveDown();
      const headers = [type === 'income' ? 'Revenue Source' : 'Votehead', 'Total Amount'];
      const columnWidths = [300, 200];
      let y = 150;
      doc.fontSize(10);
      headers.forEach((header, i) => {
        doc.text(header, 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), y);
      });
      y += 20;
      aggregatedData.forEach(item => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
        doc.text(item.name, 50, y);
        doc.text(item.totalAmount.toFixed(2), 350, y);
        y += 20;
      });
      const total = aggregatedData.reduce((sum, item) => sum + item.totalAmount, 0);
      doc.moveDown();
      doc.fontSize(12).text(`Total: ${total.toFixed(2)}`, { align: 'right' });
    doc.end();
    } else {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`${type} Summary`);
      worksheet.mergeCells('A1:B1');
      worksheet.getCell('A1').value = `${type.charAt(0).toUpperCase() + type.slice(1)} Summary Report`;
      worksheet.getCell('A1').font = { size: 16, bold: true };
      worksheet.getCell('A1').alignment = { horizontal: 'center' };
      worksheet.mergeCells('A2:B2');
      worksheet.getCell('A2').value = `Period: ${moment(startDate).format('MMM D, YYYY')} - ${moment(endDate).format('MMM D, YYYY')}`;
      worksheet.getCell('A2').alignment = { horizontal: 'center' };
      const headers = [type === 'income' ? 'Revenue Source' : 'Votehead', 'Total Amount'];
      worksheet.addRow(headers);
      worksheet.getRow(3).font = { bold: true };
      worksheet.getRow(3).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      aggregatedData.forEach(item => {
        worksheet.addRow([item.name, item.totalAmount]);
      });
      const total = aggregatedData.reduce((sum, item) => sum + item.totalAmount, 0);
      worksheet.addRow(['Total', total]);
      worksheet.getCell(`B${aggregatedData.length + 4}`).font = { bold: true };
      worksheet.getColumn(1).width = 40;
      worksheet.getColumn(2).width = 20;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${type}_aggregated_report.xlsx`);
      await workbook.xlsx.write(res);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
