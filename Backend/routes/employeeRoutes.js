import express from "express";
import {
  createEmployee,
  getEmployees,
  updateEmployee,
  deleteEmployee,
  getEmployeeChart,
  getSerializedEmployees,
  getEmpToAdvanceMark,
  // getAttendanceEmp
  getAvailableEmpID
} from "../controllers/employeeCon.js";

const router = express.Router();

router.post("/create", createEmployee);


router.get("/", getEmployees);

router.put("/update/:id", updateEmployee);

router.put("/delete/:id", deleteEmployee);


router.get("/chart", getEmployeeChart);

router.get("/serialized", getSerializedEmployees);

router.get("/getEmpToAdvanceMark",getEmpToAdvanceMark)

router.get("/getAvailableEmployeeId/", getAvailableEmpID)


export default router;
